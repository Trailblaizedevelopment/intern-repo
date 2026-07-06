const SLACK_API = 'https://slack.com/api';

export async function slackApi<T extends Record<string, unknown>>(
  method: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; error?: string } & T> {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) {
    return { ok: false, error: 'SLACK_BOT_TOKEN not configured' } as { ok: boolean; error?: string } & T;
  }

  const res = await fetch(`${SLACK_API}/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });

  return (await res.json()) as { ok: boolean; error?: string } & T;
}

/** Split long text for Slack chat.postMessage (safe under 4k). */
export function chunkSlackMessage(text: string, maxLen = 3900): string[] {
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

export async function postSlackMessage(
  channel: string,
  text: string,
  threadTs?: string
): Promise<{ ok: boolean; error?: string }> {
  const chunks = chunkSlackMessage(text);
  for (let i = 0; i < chunks.length; i++) {
    const prefix = chunks.length > 1 ? `(${i + 1}/${chunks.length})\n` : '';
    const result = await slackApi('chat.postMessage', {
      channel,
      text: prefix + chunks[i],
      thread_ts: threadTs,
      unfurl_links: false,
      unfurl_media: false,
    });
    if (!result.ok) return { ok: false, error: result.error || 'chat.postMessage failed' };
  }
  return { ok: true };
}

export async function openDmChannel(userId: string): Promise<{ ok: boolean; channel?: string; error?: string }> {
  const opened = await slackApi<{ channel?: { id: string } }>('conversations.open', { users: userId });
  if (!opened.ok) return { ok: false, error: opened.error };
  return { ok: true, channel: opened.channel?.id };
}
