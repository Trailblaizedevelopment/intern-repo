import { NextRequest, NextResponse } from 'next/server';
import { runScheduledSlackReplies } from '@/lib/brain/scheduled-replies/run';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/cron/brain-scheduled-replies
 *
 * Every ~1 min: post due Dynamo Slack follow-ups (wake/ready/remind).
 *
 * Auth: Authorization: Bearer CRON_SECRET or INTERNAL_API_KEY
 */

export const maxDuration = 60;

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
    .eq('name', 'scheduled_slack_replies')
    .maybeSingle();

  if (automation && automation.enabled === false) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'scheduled_slack_replies disabled',
    });
  }

  try {
    const result = await runScheduledSlackReplies(supabase);

    await supabase
      .from('brain_automations')
      .update({
        last_run_at: new Date().toISOString(),
        last_status: 'success',
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('name', 'scheduled_slack_replies');

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Scheduled replies failed';
    console.error('[cron/brain-scheduled-replies]', err);

    await supabase
      .from('brain_automations')
      .update({
        last_run_at: new Date().toISOString(),
        last_status: 'failed',
        last_error: msg.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq('name', 'scheduled_slack_replies');

    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
