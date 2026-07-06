import { NextRequest, NextResponse } from 'next/server';
import { runMorningBriefing } from '@/lib/brain/briefing/run';
import { isMorningBriefingWindow } from '@/lib/brain/briefing/time';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/cron/brain-morning-briefing
 *
 * Weekday ~8:30 AM America/New_York: fetch active Linear issues, compose briefing,
 * post to Slack (#trailblaize-brain channel and/or DM).
 *
 * Query:
 *   force=1     — skip time window (manual / script testing)
 *   dry_run=1   — compose only, do not post to Slack
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

  const force = req.nextUrl.searchParams.get('force') === '1';
  const dryRun = req.nextUrl.searchParams.get('dry_run') === '1';

  if (!force && !isMorningBriefingWindow(new Date())) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'Outside morning briefing window (weekdays ~8:30 AM ET)',
    });
  }

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data: automation } = await supabase
      .from('brain_automations')
      .select('enabled')
      .eq('name', 'morning_briefing')
      .maybeSingle();

    if (automation && automation.enabled === false && !force) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'morning_briefing disabled' });
    }
  }

  try {
    const result = await runMorningBriefing({ dryRun, postToSlack: !dryRun });
    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      message: result.message,
      slack: result.slack,
      snapshot_summary: {
        active: result.snapshot.active.length,
        completed_yesterday: result.snapshot.completedYesterday.length,
        due_today: result.snapshot.dueToday.length,
        overdue: result.snapshot.overdue.length,
        counts_by_state: result.snapshot.countsByState,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Morning briefing failed';
    console.error('[cron/brain-morning-briefing]', err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
