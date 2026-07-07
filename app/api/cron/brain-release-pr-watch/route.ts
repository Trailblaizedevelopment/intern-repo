import { NextRequest, NextResponse } from 'next/server';
import { runReleasePrWatch } from '@/lib/brain/release-pr/run';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/cron/brain-release-pr-watch
 *
 * Every ~5 min: detect open develop → main PR with empty body, compose release
 * description from commit history, update GitHub, notify Slack.
 *
 * Query:
 *   force=1       — re-run even if already processed (still skips non-empty body)
 *   dry_run=1     — compose only, do not update GitHub or post Slack
 *   pr=702        — target a specific PR number
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
  const prParam = req.nextUrl.searchParams.get('pr');
  const prNumber = prParam ? parseInt(prParam, 10) : undefined;

  const supabase = getSupabaseAdmin();
  if (supabase && !force) {
    const { data: automation } = await supabase
      .from('brain_automations')
      .select('enabled')
      .eq('name', 'release_pr_watch')
      .maybeSingle();

    if (automation && automation.enabled === false) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'release_pr_watch disabled' });
    }
  }

  try {
    const result = await runReleasePrWatch({
      dryRun,
      postToSlack: !dryRun,
      force,
      prNumber: Number.isFinite(prNumber) ? prNumber : undefined,
    });

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      ...result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Release PR watch failed';
    console.error('[cron/brain-release-pr-watch]', err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
