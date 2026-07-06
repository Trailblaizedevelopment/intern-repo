type SlackDelivery = 'channel' | 'dm' | 'both';

function deliveryMode(): SlackDelivery {
  const mode = (process.env.SLACK_BRAIN_DELIVERY || 'channel').toLowerCase();
  if (mode === 'dm' || mode === 'both') return mode as SlackDelivery;
  return 'channel';
}

async function slackApi(method: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; channel?: string }> {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) {
    return { ok: false, error: 'SLACK_BOT_TOKEN not configured' };
  }

  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as { ok: boolean; error?: string; channel?: string; ts?: string };
  if (!data.ok) {
    return { ok: false, error: data.error || `Slack ${method} failed` };
  }
  return { ok: true, channel: data.channel };
}

/** Split long text for Slack chat.postMessage (safe under 4k). */
function chunkMessage(text: string, maxLen = 3900): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > maxLen) {
    let splitAt = rest.lastIndexOf('\n', maxLen);
    if (splitAt < maxLen * 0.5) splitAt = maxLen;
    chunks.push(rest.slice(0, splitAt));
    rest = rest.slice(splitAt).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

async function postMessage(target: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const chunks = chunkMessage(text);
  for (let i = 0; i < chunks.length; i++) {
    const prefix = chunks.length > 1 ? `(${i + 1}/${chunks.length})\n` : '';
    const result = await slackApi('chat.postMessage', {
      channel: target,
      text: prefix + chunks[i],
      unfurl_links: false,
      unfurl_media: false,
    });
    if (!result.ok) return result;
  }
  return { ok: true };
}

async function resolveDmChannel(userId: string): Promise<{ ok: boolean; channel?: string; error?: string }> {
  const opened = await slackApi('conversations.open', { users: userId });
  if (!opened.ok) return opened;
  return { ok: true, channel: opened.channel };
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
    if (!res.ok) {
      errors.push(`webhook HTTP ${res.status}`);
    } else {
      targets.push('webhook');
    }
  }

  if (token) {
    if ((mode === 'channel' || mode === 'both') && channelId) {
      const r = await postMessage(channelId, text);
      if (r.ok) targets.push(`channel:${channelId}`);
      else errors.push(r.error || 'channel post failed');
    }

    if ((mode === 'dm' || mode === 'both') && dmUserId) {
      const dm = await resolveDmChannel(dmUserId);
      if (!dm.ok || !dm.channel) {
        errors.push(dm.error || 'DM open failed');
      } else {
        const r = await postMessage(dm.channel, text);
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
