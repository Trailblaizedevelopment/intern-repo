import { openDmChannel, postSlackMessage, slackApi } from '../slack/client';

type SlackDelivery = 'channel' | 'dm' | 'both';

function deliveryMode(): SlackDelivery {
  const mode = (process.env.SLACK_BRAIN_DELIVERY || 'channel').toLowerCase();
  if (mode === 'dm' || mode === 'both') return mode as SlackDelivery;
  return 'channel';
}

export interface SlackPostResult {
  attempted: boolean;
  ok: boolean;
  targets: string[];
  error?: string;
}

/** Post briefing to configured Slack channel and/or DM. */
export async function postBriefingToSlack(text: string): Promise<SlackPostResult> {
  const webhook = process.env.SLACK_BRAIN_WEBHOOK_URL?.trim();
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  const channelId = process.env.SLACK_BRAIN_CHANNEL_ID?.trim();
  const dmUserId = process.env.SLACK_BRAIN_DM_USER_ID?.trim();
  const mode = deliveryMode();

  if (!token && !webhook) {
    return { attempted: false, ok: false, targets: [], error: 'Slack not configured' };
  }

  const targets: string[] = [];
  const errors: string[] = [];

  if (webhook) {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) errors.push(`webhook HTTP ${res.status}`);
    else targets.push('webhook');
  }

  if (token) {
    if ((mode === 'channel' || mode === 'both') && channelId) {
      const r = await postSlackMessage(channelId, text);
      if (r.ok) targets.push(`channel:${channelId}`);
      else errors.push(r.error || 'channel post failed');
    }

    if ((mode === 'dm' || mode === 'both') && dmUserId) {
      const dm = await openDmChannel(dmUserId);
      if (!dm.ok || !dm.channel) {
        errors.push(dm.error || 'DM open failed');
      } else {
        const r = await postSlackMessage(dm.channel, text);
        if (r.ok) targets.push(`dm:${dmUserId}`);
        else errors.push(r.error || 'DM post failed');
      }
    }
  }

  if (targets.length === 0 && errors.length > 0) {
    return { attempted: true, ok: false, targets, error: errors.join('; ') };
  }

  return { attempted: true, ok: targets.length > 0, targets, error: errors.length ? errors.join('; ') : undefined };
}

// Re-export for scripts that need auth.test
export { slackApi };
