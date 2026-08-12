import { NextRequest, NextResponse } from 'next/server';
import { runScoutFollowups } from '@/lib/scout/run-followups';

/**
 * GET /api/cron/scout-followups
 *
 * Every 15 min: send due Scout proactive nudges (48h then 72h, max 3 unanswered outbound).
 *
 * Auth: Authorization: Bearer CRON_SECRET or INTERNAL_API_KEY
 */

export const maxDuration = 120;

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const cronSecret = process.env.CRON_SECRET || '';
  const internal = process.env.INTERNAL_API_KEY || '';
  return token === internal || (cronSecret !== '' && token === cronSecret);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runScoutFollowups(20);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Scout follow-ups failed';
    console.error('[cron/scout-followups]', err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
