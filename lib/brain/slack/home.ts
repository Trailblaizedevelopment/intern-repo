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
    'I want to create a Linear ticket. Use the Linear ticket template (Description + Acceptance criteria + Files relating when known). For feature asks, do a short GitHub code search first, then create it.',
  home_qp_ticket_progress:
    'I want a progress update on a Linear ticket. Ask me for the TRA id (e.g. TRA-123), then report status, recent comments, and Cursor Cloud progress if available.',
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
        {
          type: 'button',
          action_id: 'home_qp_ticket_progress',
          text: { type: 'plain_text', text: 'Ticket progress', emoji: true },
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
          '• *Lookup* — status, lists, summaries\n' +
          '• *Create tickets* — Linear issues using the ticket template MD; feature asks get a light GitHub code search before save\n' +
          '• *Ticket progress* — *progress on TRA-123* (Linear state + comments + Cursor Cloud when linked)\n' +
          '• *Hand off to Cursor* — *fix TRA-123* / *implement TRA-123* → I confirm, then assign Cursor on Linear\n' +
          'Ask in Messages; I stay in Lookup and never invent Slice/Goal queues.',
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
          '• *Cursor* — assign on Linear (`BRAIN_LINEAR_DELEGATE_CURSOR=true`); progress via Cloud Agents API (`CURSOR_API_KEY`)',
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
