import { NextRequest, NextResponse } from 'next/server';
import { authenticateBrainRequest } from '@/lib/brain/auth';
import { createBrainTask, listActiveBrainTasks } from '@/lib/brain/tasks/store';
import { BrainTaskKind } from '@/lib/brain/tasks/types';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET  — list active brain tasks
 * POST — create a task { goal, task_kind?, linear_issue_id?, max_minutes? }
 */

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = await authenticateBrainRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const tasks = await listActiveBrainTasks(supabase, 20);
  return NextResponse.json({ data: tasks });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateBrainRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  let body: {
    goal?: string;
    task_kind?: BrainTaskKind;
    linear_issue_id?: string;
    max_minutes?: number;
    conversation_id?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const goal = (body.goal || '').trim();
  if (!goal) {
    return NextResponse.json({ error: 'goal is required' }, { status: 400 });
  }

  try {
    const task = await createBrainTask(supabase, {
      goal,
      taskKind: body.task_kind === 'slice' ? 'slice' : 'goal',
      linearIssueId: body.linear_issue_id,
      maxMinutes: body.max_minutes,
      employeeId: auth.identity.employeeId,
      source: 'chat',
      conversationId: body.conversation_id,
    });
    return NextResponse.json({ data: task });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create task';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
