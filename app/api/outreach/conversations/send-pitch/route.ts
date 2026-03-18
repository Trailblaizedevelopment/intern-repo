import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendMessage } from '@/lib/linq';

const AUTH_TOKEN = 'hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h';

const LINE_PHONES: Record<number, string> = {
  1: '+16462101111', // Owen (new line, warming up 2026-03-17)
  2: '+16462668785', // Adam
  3: '+16462442696', // Ford
};

/**
 * POST /api/outreach/conversations/send-pitch
 *
 * Human-triggered T1.2 (pitch) — sends the sign-up link to a confirmed contact.
 * Uses the SAME Linq line that sent T1 for conversation continuity.
 * Sets outreach_status = 'pitched'.
 *
 * Body: { contact_id: string }
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== AUTH_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const { contact_id } = await req.json();
  if (!contact_id) return NextResponse.json({ error: 'contact_id required' }, { status: 400 });

  // Fetch contact + chapter
  const { data: contact, error: contactErr } = await supabase
    .from('alumni_contacts')
    .select('id, first_name, last_name, outreach_status, linq_chat_id, assigned_line, chapter_id')
    .eq('id', contact_id)
    .single();

  if (contactErr || !contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }

  if (contact.outreach_status !== 'touch1_confirmed') {
    return NextResponse.json({
      error: `Cannot send pitch — contact status is '${contact.outreach_status}', expected 'touch1_confirmed'`
    }, { status: 400 });
  }

  if (!contact.linq_chat_id) {
    return NextResponse.json({ error: 'No Linq chat ID on contact — cannot send pitch' }, { status: 400 });
  }

  // Get chapter for join link
  const { data: chapter } = await supabase
    .from('chapters')
    .select('fraternity_name, university, alumni_join_link')
    .eq('id', contact.chapter_id)
    .single();

  const joinLink = chapter?.alumni_join_link || 'https://trailblaize.net';
  const fratName = chapter?.fraternity_name || 'your fraternity';
  const university = chapter?.university || 'your school';

  // Build T1.2 message — pitch with sign-up link
  const message = buildPitchMessage(contact.first_name, fratName, university, joinLink);

  // Determine line phone — use assigned_line for same-line continuity
  const linePhone = LINE_PHONES[contact.assigned_line as number] || LINE_PHONES[1];

  try {
    await sendMessage(contact.linq_chat_id, message);

    // Update status to pitched
    await supabase
      .from('alumni_contacts')
      .update({
        outreach_status: 'pitched',
        touch2_sent_at: new Date().toISOString(),
      })
      .eq('id', contact_id);

    return NextResponse.json({
      success: true,
      contact_id,
      message_preview: message.slice(0, 80),
      line_phone: linePhone,
    });
  } catch (e) {
    return NextResponse.json({ error: `Send failed: ${String(e)}` }, { status: 500 });
  }
}

function buildPitchMessage(
  firstName: string,
  fratName: string,
  university: string,
  joinLink: string
): string {
  const name = firstName || 'there';
  return `Hey ${name} - I work with Trailblaize. We just built a private alumni network for ${fratName} at ${university}. It is where guys stay connected, find jobs through the network, and see what the chapter is up to. Takes 2 min to join - ${joinLink}`;
}
