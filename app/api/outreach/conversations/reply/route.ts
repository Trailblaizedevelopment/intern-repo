import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendMessage, getMessages } from '@/lib/linq';

const AUTH_TOKEN = 'hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h';

const LINQ_LINE_PHONES = new Set(['+16462408056', '+16462668785', '+16462442696']);

/**
 * POST /api/outreach/conversations/reply
 *
 * Send a freeform reply to an existing conversation via Linq.
 * Uses the SAME line that originally sent T1 (assigned_line on contact).
 * Human-triggered only — never called autonomously.
 *
 * Body: { contact_id: string, message: string }
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== AUTH_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const { contact_id, message } = await req.json();
  if (!contact_id || !message?.trim()) {
    return NextResponse.json({ error: 'contact_id and message are required' }, { status: 400 });
  }

  const { data: contact, error } = await supabase
    .from('alumni_contacts')
    .select('id, linq_chat_id, assigned_line')
    .eq('id', contact_id)
    .single();

  if (error || !contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }

  if (!contact.linq_chat_id) {
    return NextResponse.json({ error: 'No Linq chat ID on this contact' }, { status: 400 });
  }

  // ── Duplicate send protection ──────────────────────────────────────────────
  const sixtyMinAgo = Date.now() - 60 * 60 * 1000;
  const recentMsgs = await getMessages(contact.linq_chat_id!, 10);
  const isDuplicate = recentMsgs.some(m =>
    LINQ_LINE_PHONES.has(m.from) &&
    new Date(m.created_at).getTime() > sixtyMinAgo &&
    m.parts.filter(p => p.type === 'text').map(p => p.value).join(' ').trim() === message.trim()
  );
  if (isDuplicate) {
    return NextResponse.json({ error: 'DUPLICATE_BLOCKED' }, { status: 409 });
  }

  try {
    await sendMessage(contact.linq_chat_id, message.trim());
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: `Send failed: ${String(e)}` }, { status: 500 });
  }
}
