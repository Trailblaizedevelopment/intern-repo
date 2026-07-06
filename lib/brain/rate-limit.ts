/**
 * Best-effort in-memory rate limit for Brain chat (single-user Dev Console).
 * Resets on cold starts; sufficient for cost guardrails with one operator.
 */

interface Bucket {
  minuteHits: number[];
  hourHits: number[];
}

const buckets = new Map<string, Bucket>();

function envInt(name: string, fallback: number): number {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function prune(timestamps: number[], windowMs: number, now: number): number[] {
  return timestamps.filter(t => now - t < windowMs);
}

export type BrainRateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number; reason: string };

/** Key by authenticated email (Dev Console allowlist). */
export function checkBrainRateLimit(identityKey: string): BrainRateLimitResult {
  const perMinute = envInt('BRAIN_RATE_LIMIT_PER_MINUTE', 8);
  const perHour = envInt('BRAIN_RATE_LIMIT_PER_HOUR', 40);
  const now = Date.now();

  let bucket = buckets.get(identityKey);
  if (!bucket) {
    bucket = { minuteHits: [], hourHits: [] };
    buckets.set(identityKey, bucket);
  }

  bucket.minuteHits = prune(bucket.minuteHits, 60_000, now);
  bucket.hourHits = prune(bucket.hourHits, 3_600_000, now);

  if (bucket.minuteHits.length >= perMinute) {
    const oldest = bucket.minuteHits[0] ?? now;
    const retryAfterSec = Math.ceil((60_000 - (now - oldest)) / 1000);
    return {
      ok: false,
      retryAfterSec: Math.max(1, retryAfterSec),
      reason: `Rate limit: max ${perMinute} messages per minute`,
    };
  }

  if (bucket.hourHits.length >= perHour) {
    const oldest = bucket.hourHits[0] ?? now;
    const retryAfterSec = Math.ceil((3_600_000 - (now - oldest)) / 1000);
    return {
      ok: false,
      retryAfterSec: Math.max(1, retryAfterSec),
      reason: `Rate limit: max ${perHour} messages per hour`,
    };
  }

  bucket.minuteHits.push(now);
  bucket.hourHits.push(now);
  return { ok: true };
}
