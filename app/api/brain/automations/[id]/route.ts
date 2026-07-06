import { NextRequest, NextResponse } from 'next/server';
import { computeNextAutomationRun } from '@/lib/brain/automation-schedule';
import { authenticateBrainRequest } from '@/lib/brain/auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET  /api/brain/automations/[id] — detail + last run log + next run
 * PATCH /api/brain/automations/[id] — { enabled: boolean }
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

  const { data: automation, error } = await supabase
    .from('brain_automations')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !automation) {
    return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
  }

  const { data: lastLog } = await supabase
    .from('brain_action_log')
    .select('id, status, error, output, created_at')
    .eq('source', 'automation')
    .eq('skill_name', automation.name)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextRun = computeNextAutomationRun(
    automation.schedule,
    automation.kind,
    automation.config,
    automation.enabled
  );

  const output = lastLog?.output as { message_preview?: string } | null;

  return NextResponse.json({
    data: {
      automation,
      next_run_at: nextRun?.toISOString() ?? null,
      last_run: lastLog
        ? {
            at: lastLog.created_at,
            status: lastLog.status,
            error: lastLog.error,
            output_preview: output?.message_preview ?? null,
          }
        : automation.last_run_at
          ? {
              at: automation.last_run_at,
              status: automation.last_status,
              error: automation.last_error,
              output_preview: null,
            }
          : null,
    },
  });
}

export async function PATCH(
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

  let body: { enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled (boolean) is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('brain_automations')
    .update({ enabled: body.enabled, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Automation not found' }, { status: 404 });
  }

  return NextResponse.json({ data });
}
