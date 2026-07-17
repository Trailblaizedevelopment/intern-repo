import { NextRequest, NextResponse } from 'next/server';
import { runCursorDelegateWatch } from '@/lib/brain/cursor-delegate-watch/run';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/cron/brain-cursor-delegate-watch
 *
 * Every ~5 min: poll Path A Cursor watches. When a run reaches FINISHED and the
 * Linear ticket is still In Progress, notify #trailblaize-brain (+ origin thread).
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

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const { data: automation } = await supabase
    .from('brain_automations')
    .select('enabled')
    .eq('name', 'cursor_delegate_watch')
    .maybeSingle();

  if (automation && automation.enabled === false) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'cursor_delegate_watch disabled',
    });
  }

  try {
    const result = await runCursorDelegateWatch(supabase);

    await supabase
      .from('brain_automations')
      .update({
        last_run_at: new Date().toISOString(),
        last_status: 'success',
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('name', 'cursor_delegate_watch');

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Cursor delegate watch failed';
    console.error('[cron/brain-cursor-delegate-watch]', err);

    await supabase
      .from('brain_automations')
      .update({
        last_run_at: new Date().toISOString(),
        last_status: 'failed',
        last_error: msg.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq('name', 'cursor_delegate_watch');

    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
