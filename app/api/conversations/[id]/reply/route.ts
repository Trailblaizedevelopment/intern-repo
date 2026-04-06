/**
 * POST /api/conversations/[id]/reply
 * Send a reply from the conversation's locked line.
 *
 * Body: { message: string }
 * Requires: Authorization: Bearer <internal_token>
 *
 * LINE LOCKING: always uses the line_phone stored on the conversation.
 * Never looks up "active line". If line deprovisioned → error.
 * If line paused → send anyway (paused blocks outreach, not replies).
 * Dedup: rejects same message text to same chat within 60 min.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendMessage } from '@/lib/linq';
import { LINQ_LINES } from '@/lib/linq-recovery';

const INTERNAL_TOKEN = process.env.INTERNAL_API_KEY || '';

function checkAuth(req: NextRequest): boolean {
  return (req.headers.get('Authorization') || '') === `Bearer ${INTERNAL_TOKEN}`;
}

// Simple in-process dedup cache: "chatId:message" → timestamp
const recentReplies = new Map<string, number>();
const DEDUP_WINDOW_MS = 60 * 60 * 1000; // 60 minutes

function isDuplicate(chatId: string, message: string): boolean {
  const key = `${chatId}:${message}`;
  const last = recentReplies.get(key);
  if (!last) return false;
  if (Date.now() - last < DEDUP_WINDOW_MS) return true;
  recentReplies.delete(key);
  return false;
}

function markSent(chatId: string, message: string): void {
  recentReplies.set(`${chatId}:${message}`, Date.now());
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 500 });
  }

  const { id } = await params;

  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const message = (body.message || '').trim();
  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  // Fetch conversation
  const { data: conv, error: convErr } = await supabase
    .from('linq_conversations')
    .select('linq_chat_id, line_phone')
    .eq('id', id)
    .single();

  if (convErr || !conv) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  const { linq_chat_id, line_phone } = conv;

  // Verify line is provisioned
  const lineConfig = LINQ_LINES.find(l => l.phone === line_phone);
  if (!lineConfig) {
    return NextResponse.json({ error: 'line deprovisioned' }, { status: 400 });
  }

  // Dedup check
  if (isDuplicate(linq_chat_id, message)) {
    return NextResponse.json(
      { error: 'Duplicate message — same text sent to this chat within 60 min' },
      { status: 409 }
    );
  }

  // Send via Linq (line locking: pass fromPhone)
  try {
    const sent = await sendMessage(linq_chat_id, message, line_phone);
    markSent(linq_chat_id, message);

    // Update last_message fields in DB
    const now = new Date().toISOString();
    await supabase
      .from('linq_conversations')
      .update({
        last_message_at: now,
        last_message_text: message,
        last_message_direction: 'outbound',
        has_unread_reply: false,
        updated_at: now,
      })
      .eq('id', id);

    return NextResponse.json({ data: sent });
  } catch (err) {
    console.error('[conversations/reply]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
