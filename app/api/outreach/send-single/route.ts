import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { createChat } from '@/lib/linq';

// Lines 1 (Owen) and 3 (Ford) are EXCLUDED from outreach sends.
// Only line 2 (Adam) is used for chapter outreach.
const OUTREACH_LINE_PHONES: Record<number, string> = {
  2: '+16462178274', // Adam — outreach line
};
const OUTREACH_LINE_NUMBERS = [2];

// ── Message builders ──────────────────────────────────────────────────────────

function buildT1Message(firstName: string, fraternityName: string, school: string): string {
  return `Hey ${firstName}, this is Ford from Trailblaize. I'm reaching out to verify your phone number on the ${school} ${fraternityName} alumni list. Do I have the right number?`;
}

function buildT2Message(
  firstName: string,
  fraternityName: string,
  school: string,
  joinLink: string,
  status: string,
  daysSinceT1: number,
): string {
  if (status === 'touch1_confirmed' && daysSinceT1 < 7) {
    return `Hey ${firstName}, great! Here's the link to join the ${fraternityName} alumni network at ${school} - free, takes 2 min: ${joinLink}`;
  }
  if (status === 'touch1_confirmed') {
    return `Hey ${firstName}, checking back in - we're still building out the ${fraternityName} alumni network at ${school} and would love to have you. Here's the link if you're interested: ${joinLink}`;
  }
  // touch1_sent (no reply)
  return `Hey ${firstName}, just following up - we're building out the ${fraternityName} alumni network at ${school}. Here's the link if you're interested: ${joinLink}`;
}

function buildT3Message(firstName: string, fraternityName: string): string {
  return `Hey ${firstName}, last one from us. If you ever want to connect with other ${fraternityName} guys, we're at trailblaize.net. No pressure.`;
}

// ── Round-robin line picker ───────────────────────────────────────────────────

async function pickOutreachLine(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<{ lineNumber: number; fromPhone: string } | null> {
  if (!supabase) return { lineNumber: 2, fromPhone: OUTREACH_LINE_PHONES[2] };

  const { data: lineConfigs } = await supabase
    .from('linq_line_config')
    .select('id, line_number, is_paused, last_used_at')
    .in('line_number', OUTREACH_LINE_NUMBERS)
    .order('line_number');

  type LineConfig = {
    id: string;
    line_number: number;
    is_paused: boolean;
    last_used_at: string | null;
  };

  const available = ((lineConfigs || []) as LineConfig[])
    .filter((lc) => !lc.is_paused && OUTREACH_LINE_PHONES[lc.line_number])
    .sort((a, b) => {
      // Oldest last_used_at first (true round-robin)
      const tA = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
      const tB = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;
      return tA - tB;
    });

  if (available.length === 0) {
    // Fall back to line 2 even if no config row exists
    const fallbackPhone = OUTREACH_LINE_PHONES[2];
    if (fallbackPhone) return { lineNumber: 2, fromPhone: fallbackPhone };
    return null;
  }

  const chosen = available[0];
  return { lineNumber: chosen.line_number, fromPhone: OUTREACH_LINE_PHONES[chosen.line_number] };
}

async function updateLineLastUsed(supabase: ReturnType<typeof getSupabaseAdmin>, lineNumber: number) {
  if (!supabase) return;
  await supabase
    .from('linq_line_config')
    .update({ last_used_at: new Date().toISOString() })
    .eq('line_number', lineNumber);
}

// ── POST /api/outreach/send-single ───────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contact_id, touch } = body as { contact_id: string; touch: 'T1' | 'T2' | 'T3' };

    if (!contact_id || !touch || !['T1', 'T2', 'T3'].includes(touch)) {
      return NextResponse.json({ error: 'contact_id and touch (T1|T2|T3) are required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

    // 1. Fetch contact
    const { data: contact, error: cErr } = await supabase
      .from('alumni_contacts')
      .select('id, first_name, last_name, phone_primary, chapter_id, outreach_status, touch1_sent_at, touch2_sent_at, touch3_sent_at, linq_chat_id')
      .eq('id', contact_id)
      .single();

    if (cErr || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }
    if (!contact.phone_primary) {
      return NextResponse.json({ error: 'Contact has no phone number' }, { status: 400 });
    }
    if (!contact.first_name || contact.first_name.trim() === '') {
      return NextResponse.json({ error: 'Contact has no first name — cannot send personalized message' }, { status: 400 });
    }

    // 2. Fetch chapter
    const { data: chapter, error: chErr } = await supabase
      .from('chapters')
      .select('id, fraternity, school, alumni_join_link')
      .eq('id', contact.chapter_id)
      .single();

    if (chErr || !chapter) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
    }

    const fraternityName = chapter.fraternity || 'your fraternity';
    const school = chapter.school || 'your school';
    const joinLink = chapter.alumni_join_link || 'https://trailblaize.net';

    // 3. Build message
    const daysSinceT1 = contact.touch1_sent_at
      ? (Date.now() - new Date(contact.touch1_sent_at).getTime()) / (1000 * 60 * 60 * 24)
      : 0;

    let message: string;
    if (touch === 'T1') {
      message = buildT1Message(contact.first_name, fraternityName, school);
    } else if (touch === 'T2') {
      if (!chapter.alumni_join_link) {
        return NextResponse.json({ error: 'Chapter has no join link — cannot send T2/T3' }, { status: 400 });
      }
      message = buildT2Message(contact.first_name, fraternityName, school, joinLink, contact.outreach_status, daysSinceT1);
    } else {
      message = buildT3Message(contact.first_name, fraternityName);
    }

    // 4. Pick outreach line
    const line = await pickOutreachLine(supabase);
    if (!line) {
      return NextResponse.json({ error: 'No outreach lines available' }, { status: 503 });
    }

    // 5. Atomic claim — prevent double-sends
    const now = new Date().toISOString();
    let claimData;

    if (touch === 'T1') {
      const { data } = await supabase
        .from('alumni_contacts')
        .update({
          outreach_status: 'touch1_sent',
          touch1_sent_at: now,
          assigned_line: line.lineNumber,
        })
        .eq('id', contact_id)
        .eq('outreach_status', 'not_contacted')
        .is('touch1_sent_at', null)
        .select('id');
      claimData = data;
    } else if (touch === 'T2') {
      const { data } = await supabase
        .from('alumni_contacts')
        .update({
          outreach_status: 'touch2_sent',
          touch2_sent_at: now,
        })
        .eq('id', contact_id)
        .in('outreach_status', ['touch1_sent', 'touch1_confirmed'])
        .is('touch2_sent_at', null)
        .select('id');
      claimData = data;
    } else {
      const { data } = await supabase
        .from('alumni_contacts')
        .update({
          outreach_status: 'touch3_sent',
          touch3_sent_at: now,
        })
        .eq('id', contact_id)
        .eq('outreach_status', 'touch2_sent')
        .is('touch3_sent_at', null)
        .select('id');
      claimData = data;
    }

    if (!claimData || claimData.length === 0) {
      return NextResponse.json({ error: 'Contact already contacted or status mismatch — skipped' }, { status: 409 });
    }

    // 6. Create Linq chat + send
    const chat = await createChat(line.fromPhone, contact.phone_primary, message);

    // 7. Store chat ID + update line last_used_at
    await supabase
      .from('alumni_contacts')
      .update({ linq_chat_id: chat.id })
      .eq('id', contact_id);

    await updateLineLastUsed(supabase, line.lineNumber);

    return NextResponse.json({
      success: true,
      contact_id,
      touch,
      line: line.lineNumber,
      chat_id: chat.id,
      message_preview: message.slice(0, 80) + (message.length > 80 ? '…' : ''),
    });
  } catch (err) {
    console.error('[send-single] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
