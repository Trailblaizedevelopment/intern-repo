import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { authenticateBrainRequest } from '@/lib/brain/auth';
import { BrainMessage, runBrainAgent, toDisplayMessages } from '@/lib/brain/agent';
import { checkBrainRateLimit } from '@/lib/brain/rate-limit';
import { sanitizeForActionLog } from '@/lib/brain/sanitize-log';

/**
 * Trailblaize Brain chat endpoint (Devin-only).
 *
 * POST { message: string, conversation_id?: string }
 *   → { reply, conversation_id, messages (display format), tool_events }
 *
 * GET  ?conversation_id=... (or omit for the most recent conversation)
 *   → { conversation_id, messages (display format) } or { conversation_id: null }
 *
 * Auth: Supabase access token via Authorization: Bearer — verified against
 * the Dev Console allowlist server-side. Middleware same-origin pass-through
 * is NOT sufficient for these routes.
 */

export const maxDuration = 120;

/** Cap stored history so conversations don't grow unbounded. */
const MAX_STORED_MESSAGES = 40;

export async function GET(request: NextRequest) {
  const auth = await authenticateBrainRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const conversationId = request.nextUrl.searchParams.get('conversation_id');

  let query = supabase
    .from('brain_conversations')
    .select('id, title, messages, updated_at')
    .order('updated_at', { ascending: false })
    .limit(1);

  if (conversationId) {
    query = query.eq('id', conversationId);
  } else if (auth.identity.employeeId) {
    query = query.eq('employee_id', auth.identity.employeeId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ conversation_id: null, messages: [] });
  }

  return NextResponse.json({
    conversation_id: data.id,
    title: data.title,
    messages: toDisplayMessages((data.messages as BrainMessage[]) || []),
  });
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

  let body: { message?: string; conversation_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const message = (body.message || '').trim();
  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }
  if (message.length > 4000) {
    return NextResponse.json({ error: 'message too long (max 4000 chars)' }, { status: 400 });
  }

  const rateLimit = checkBrainRateLimit(auth.identity.email);
  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: `${rateLimit.reason}. Try again in ${rateLimit.retryAfterSec}s.` },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } }
    );
  }

  // ── Load or create the conversation ──
  let conversationId = body.conversation_id || null;
  let history: BrainMessage[] = [];

  if (conversationId) {
    const { data: convo } = await supabase
      .from('brain_conversations')
      .select('id, messages')
      .eq('id', conversationId)
      .maybeSingle();
    if (convo) {
      history = (convo.messages as BrainMessage[]) || [];
    } else {
      conversationId = null;
    }
  }

  if (!conversationId) {
    const { data: created, error: createError } = await supabase
      .from('brain_conversations')
      .insert([
        {
          employee_id: auth.identity.employeeId,
          title: message.slice(0, 80),
          messages: [],
        },
      ])
      .select('id')
      .single();
    if (createError || !created) {
      return NextResponse.json(
        { error: createError?.message || 'Failed to create conversation' },
        { status: 500 }
      );
    }
    conversationId = created.id;
  }

  history.push({ role: 'user', content: message });

  // ── Run the agent ──
  let result;
  try {
    result = await runBrainAgent(
      history,
      { supabase, employeeId: auth.identity.employeeId },
      auth.identity.employeeName,
      { surface: 'workspace', conversationId: conversationId ?? undefined }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Agent run failed';
    console.error('[brain/chat] agent error:', err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // ── Persist conversation + audit log (best-effort) ──
  const stored = result.messages.slice(-MAX_STORED_MESSAGES);
  await supabase
    .from('brain_conversations')
    .update({ messages: stored, updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  if (result.toolEvents.length > 0) {
    const logRows = result.toolEvents.map(e => ({
      source: 'chat',
      conversation_id: conversationId,
      skill_name: e.name,
      connector_name: e.connector || e.name.split('_')[0] || null,
      input: sanitizeForActionLog(e.input),
      output: e.ok ? sanitizeForActionLog(e.output) : null,
      status: e.ok ? 'success' : 'failed',
      error: e.error ? String(sanitizeForActionLog(e.error)) : null,
    }));
    const { error: logError } = await supabase.from('brain_action_log').insert(logRows);
    if (logError) console.error('[brain/chat] action log insert failed:', logError.message);
  }

  return NextResponse.json({
    reply: result.reply,
    conversation_id: conversationId,
    messages: toDisplayMessages(stored),
    tool_events: result.toolEvents.map(e => ({ name: e.name, ok: e.ok })),
  });
}
