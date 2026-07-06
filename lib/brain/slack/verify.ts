import { createHmac, timingSafeEqual } from 'crypto';

const MAX_AGE_SEC = 60 * 5;

/** Verify Slack request signature (Events API + interactivity). */
export function verifySlackSignature(
  signingSecret: string,
  signature: string | null,
  timestamp: string | null,
  rawBody: string
): boolean {
  if (!signature || !timestamp) return false;

  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (age > MAX_AGE_SEC) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const digest = `v0=${createHmac('sha256', signingSecret).update(base).digest('hex')}`;

  try {
    const a = Buffer.from(digest);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function getSlackSigningSecret(): string {
  return (process.env.SLACK_SIGNING_SECRET || '').trim();
}

/** Allowed Slack user IDs (comma-separated). Defaults to SLACK_BRAIN_DM_USER_ID. */
export function getAllowedSlackUserIds(): Set<string> {
  const raw =
    process.env.SLACK_BRAIN_ALLOWED_USER_IDS ||
    process.env.SLACK_BRAIN_DM_USER_ID ||
    '';
  return new Set(
    raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  );
}

export function getBrainSlackChannelId(): string {
  return (process.env.SLACK_BRAIN_CHANNEL_ID || '').trim();
}
