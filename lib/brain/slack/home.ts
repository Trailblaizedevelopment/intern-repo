import { slackApi, openDmChannel, postSlackMessageReturningTs } from '@/lib/brain/slack/client';
import { handleSlackChatMessage } from '@/lib/brain/slack/handle-message';
import { getAllowedSlackUserIds } from '@/lib/brain/slack/verify';

type SlackBlock = Record<string, unknown>;

/** Action IDs for Home quick-prompt buttons → agent prompt text. */
export const HOME_QUICK_PROMPTS: Record<string, string> = {
  home_qp_linear_open: "What's open in Linear that I should know about?",
  home_qp_crm_tickets: 'Show me open CRM tickets and their status.',
  home_qp_github_prs: 'List open pull requests on GitHub.',
  home_qp_create_ticket:
    'I want to create a Linear ticket. Ask me for title, description, and team, then create it.',
};

function getSlackTeamId(): string {
  return (process.env.SLACK_TEAM_ID || 'T09UHKVCCC').trim();
}

function getSlackAppId(): string {
  return (process.env.SLACK_APP_ID || 'A0BGB2NPJ6L').trim();
}

/** Deep link to Dynamo App Home → Messages tab (desktop clients). */
export function messagesTabDeepLink(): string {
  return `slack://app?team=${getSlackTeamId()}&id=${getSlackAppId()}&tab=messages`;
}

function linearAccessNote(): string {
  const readOnly = process.env.BRAIN_LINEAR_READ_ONLY !== 'false';
  return readOnly
    ? '• *Linear* — read issues + status (writes disabled unless configured)\n'
    : '• *Linear* — read/create/update issues\n';
}

function buildHomeBlocks(userId: string): SlackBlock[] {
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Dynamo', emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `Welcome <@${userId}>. Your Trailblaize ops agent — ask in *Messages*, or start below.`,
      },
    },
    {
      type: 'actions',
      block_id: 'home_nav',
      elements: [
        {
          type: 'button',
          action_id: 'home_open_messages',
          text: { type: 'plain_text', text: 'Open Messages', emoji: true },
          url: messagesTabDeepLink(),
          style: 'primary',
        },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Quick prompts*\nTap one to start a chat in Messages automatically.',
      },
    },
    {
      type: 'actions',
      block_id: 'home_quick_prompts',
      elements: [
        {
          type: 'button',
          action_id: 'home_qp_linear_open',
          text: { type: 'plain_text', text: "What's open in Linear?", emoji: true },
        },
        {
          type: 'button',
          action_id: 'home_qp_crm_tickets',
          text: { type: 'plain_text', text: 'Open CRM tickets', emoji: true },
        },
        {
          type: 'button',
          action_id: 'home_qp_github_prs',
          text: { type: 'plain_text', text: 'List open PRs', emoji: true },
        },
        {
          type: 'button',
          action_id: 'home_qp_create_ticket',
          text: { type: 'plain_text', text: 'Create a Linear ticket', emoji: true },
        },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          '*What I can do*\n' +
          '• *Lookup* — status, lists, summaries, create Linear tickets\n' +
          '• *Ticket progress* — *progress on TRA-123* / *status of TRA-123* (Linear + Cursor Cloud when linked)\n' +
          '• *Hand off to Cursor* — say *fix TRA-123* / *implement TRA-123*; I confirm, then assign Cursor on Linear\n' +
          '• Slice/Goal queues are frozen (ops: `BRAIN_SLICE_GOAL_ENABLED=true` to re-enable)\n' +
          'Say what you need in Messages.',
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          '*What I can access*\n' +
          '• *GitHub* — open/merged PRs, code search, commits\n' +
          linearAccessNote() +
          '• *CRM tickets* — pipeline / ticket status\n' +
          '• *Supabase* — Trailblaize 1.0 (web) + Growth Space (CRM) read access\n' +
          '• *Cursor* — assign on Linear when you approve; progress via Cloud Agents API when `CURSOR_API_KEY` is set',
      },
    },
  ];
}

/** Publish Dynamo's App Home tab view for a specific Slack user. */
export async function publishHomeView(
  userId: string
): Promise<{ ok: boolean; error?: string }> {
  const result = await slackApi('views.publish', {
    user_id: userId,
    view: {
      type: 'home',
      blocks: buildHomeBlocks(userId),
    },
  });

  if (!result.ok) {
    return { ok: false, error: result.error || 'views.publish failed' };
  }
  return { ok: true };
}

/**
 * Run a Home quick-prompt: open DM, post the prompt, run the agent in that thread.
 */
export async function runHomeQuickPrompt(
  userId: string,
  actionId: string
): Promise<{ ok: boolean; error?: string }> {
  const prompt = HOME_QUICK_PROMPTS[actionId];
  if (!prompt) {
    return { ok: false, error: `Unknown quick prompt: ${actionId}` };
  }

  const allowed = getAllowedSlackUserIds();
  if (allowed.size > 0 && !allowed.has(userId)) {
    return { ok: false, error: 'User not allowed' };
  }

  const dm = await openDmChannel(userId);
  if (!dm.ok || !dm.channel) {
    return { ok: false, error: dm.error || 'conversations.open failed' };
  }

  const banner = await postSlackMessageReturningTs(
    dm.channel,
    `*Quick prompt:* ${prompt}`
  );
  if (!banner.ok || !banner.ts) {
    return { ok: false, error: banner.error || 'Failed to post prompt banner' };
  }

  await handleSlackChatMessage(prompt, {
    channel: dm.channel,
    threadTs: banner.ts,
    userId,
  });

  return { ok: true };
}
