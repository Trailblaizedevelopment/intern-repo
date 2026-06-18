/**
 * GET /api/conversations/[id]/messages
 * Fetch message thread from Linq for a conversation.
 * Returns messages sorted ascending by created_at.
 *
 * Requires: Authorization: Bearer <internal_token>
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getMessages } from '@/lib/linq';

const INTERNAL_TOKEN = process.env.INTERNAL_API_KEY || '';

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('Authorization') || '';
  return auth === `Bearer ${INTERNAL_TOKEN}`;
}

export async function GET(
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

  // Look up the conversation to get linq_chat_id
  const { data: conv, error: convErr } = await supabase
    .from('linq_conversations')
    .select('linq_chat_id')
    .eq('id', id)
    .single();

  if (convErr || !conv) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  try {
    // Fetch up to 500 messages — sorted desc from Linq, we reverse to asc
    const messages = await getMessages(conv.linq_chat_id, 500);
    // Linq returns newest first; reverse for chronological display
    const sorted = [...messages].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    return NextResponse.json({ data: sorted });
  } catch (err) {
    console.error('[conversations/messages]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
