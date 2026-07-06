import { NextRequest, NextResponse } from 'next/server';
import { authenticateBrainRequest } from '@/lib/brain/auth';
import { getBrainTask } from '@/lib/brain/tasks/store';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/brain/tasks/[id] — task status + log
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateBrainRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const task = await getBrainTask(supabase, id);
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  return NextResponse.json({ data: task });
}
