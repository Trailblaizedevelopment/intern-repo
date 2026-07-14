import { slackApi } from '@/lib/brain/slack/client';

type SlackBlock = Record<string, unknown>;

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
        text: `Welcome <@${userId}>. Ask me in *Messages*, or use the tips below.`,
      },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          '*Quick tips*\n' +
          '• DM or @mention Dynamo for tickets / status\n' +
          '• Use *Messages* for the full chat thread\n' +
          '• Ask about CRM tickets, Linear issues, or brainstorming',
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
