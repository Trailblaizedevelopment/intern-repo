import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendMessage, getMessages } from '@/lib/linq';

const AUTH_TOKEN = 'hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h';

const LINQ_LINE_PHONES = new Set(['+16462101111', '+16462178274', '+16462442696']);

// Map assigned_line number → phone. Kept in sync with linq_line_config table.
// IMPORTANT: Update these when lines are added/rotated.
const LINE_NUMBER_TO_PHONE: Record<number, string> = {
  1: '+16462101111', // Owen (new line, warming up 2026-03-17)
  2: '+16462178274', // Adam
  3: '+16462442696', // Ford
};
// Fallback: Ford's line is always active; use if assigned line is paused/unknown
const FALLBACK_LINE_PHONE = '+16462442696';

/**
 * POST /api/outreach/conversations/reply
 *
 * Send a freeform reply to an existing conversation via Linq.
 * Tries the contact's assigned_line first; falls back to an active line from
 * linq_line_config if the assigned line is paused or unknown.
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

  // ── Resolve sending line ───────────────────────────────────────────────────
  // Prefer the contact's assigned line if it's active; fall back to any active line.
  let fromPhone: string = FALLBACK_LINE_PHONE;
  try {
    const { data: lineConfigs } = await supabase
      .from('linq_line_config')
      .select('line_phone, is_paused')
      .order('line_phone');

    if (lineConfigs && lineConfigs.length > 0) {
      const activeLines = lineConfigs.filter((l: { line_phone: string; is_paused: boolean }) => !l.is_paused);
      const assignedPhone = contact.assigned_line ? LINE_NUMBER_TO_PHONE[contact.assigned_line as number] : null;
      const assignedActive = assignedPhone && activeLines.some((l: { line_phone: string }) => l.line_phone === assignedPhone);

      if (assignedActive && assignedPhone) {
        fromPhone = assignedPhone;
      } else if (activeLines.length > 0) {
        fromPhone = activeLines[0].line_phone;
      }
    }
  } catch {
    // DB lookup failed — proceed with fallback
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
    await sendMessage(contact.linq_chat_id, message.trim(), fromPhone);
    return NextResponse.json({ success: true, from_phone: fromPhone });
  } catch (e) {
    return NextResponse.json({ error: `Send failed: ${String(e)}` }, { status: 500 });
  }
}
