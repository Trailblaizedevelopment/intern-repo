import { NextRequest, NextResponse } from 'next/server';
import { runOneTaskIteration } from '@/lib/brain/tasks/runner';
import { countRunnableTasks } from '@/lib/brain/tasks/store';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/cron/brain-task-runner
 *
 * Picks one queued/running brain_task and runs a single agent iteration.
 * Schedule: every 5 minutes (vercel.json).
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

  try {
    const runnable = await countRunnableTasks(supabase);
    if (runnable === 0) {
      return NextResponse.json({ ok: true, idle: true, processed: false, runnable: 0 });
    }

    const result = await runOneTaskIteration(supabase);
    return NextResponse.json({ ok: true, idle: false, runnable, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Task runner failed';
    console.error('[cron/brain-task-runner]', err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
