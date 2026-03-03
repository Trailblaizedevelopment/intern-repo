import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * POST /api/outreach/report
 * Body: { queue_id, status: "sent" | "failed", error_message? }
 * Marks a queue entry and updates the contact's outreach_status.
 */
export async function POST(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ data: null, error: { message: 'Database not connected', code: 'DB_ERROR' } }, { status: 500 });
  }
  try {
    const { queue_id, status, error_message, linq_chat_id, provider_conversation_id } = await request.json();

    if (!queue_id || !status || !['sent', 'failed'].includes(status)) {
      return NextResponse.json({ data: null, error: { message: 'queue_id and status (sent/failed) are required', code: 'VALIDATION_ERROR' } }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { status };
    if (status === 'sent') updateData.sent_at = new Date().toISOString();
    if (error_message) updateData.error_message = error_message;

    const { data: entry, error: updateErr } = await supabase
      .from('outreach_queue')
      .update(updateData)
      .eq('id', queue_id)
      .select('contact_id')
      .single();

    if (updateErr) {
      return NextResponse.json({ data: null, error: { message: updateErr.message, code: 'DB_ERROR' } }, { status: 500 });
    }

    if (status === 'sent') {
      const contactUpdate: Record<string, unknown> = { outreach_status: 'verified' };
      if (linq_chat_id) contactUpdate.linq_chat_id = linq_chat_id;

      await supabase
        .from('alumni_contacts')
        .update(contactUpdate)
        .eq('id', entry.contact_id)
        .eq('outreach_status', 'not_contacted');
    } else if (status === 'failed') {
      await supabase
        .from('alumni_contacts')
        .update({ outreach_status: 'wrong_number' })
        .eq('id', entry.contact_id)
        .eq('outreach_status', 'not_contacted');
    }

    if (provider_conversation_id && entry.contact_id) {
      await supabase
        .from('alumni_contacts')
        .update({ provider_conversation_id })
        .eq('id', entry.contact_id);
    }

    return NextResponse.json({ data: { updated: true }, error: null });
  } catch (err) {
    console.error('Error reporting send:', err);
    return NextResponse.json({ data: null, error: { message: 'Failed to report send status', code: 'SERVER_ERROR' } }, { status: 500 });
  }
}
