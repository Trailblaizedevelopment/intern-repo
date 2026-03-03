import { NextRequest, NextResponse } from 'next/server';
import { messaging } from '@/lib/messaging';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { SENDING_LINES } from '@/lib/supabase';

/**
 * POST /api/outreach/send-reply
 * Body: { contact_id, message }
 * Sends a reply to an existing conversation.
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { data: null, error: { message: 'Server configuration error', code: 'CONFIG_ERROR' } },
      { status: 500 }
    );
  }

  try {
    const { contact_id, message } = await request.json();

    if (!contact_id || !message) {
      return NextResponse.json(
        { data: null, error: { message: 'contact_id and message are required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const { data: contact, error } = await supabase
      .from('alumni_contacts')
      .select('id, provider_conversation_id, linq_chat_id, assigned_line')
      .eq('id', contact_id)
      .single();

    if (error || !contact) {
      return NextResponse.json(
        { data: null, error: { message: 'Contact not found', code: 'NOT_FOUND' } },
        { status: 404 }
      );
    }

    const conversationId = contact.provider_conversation_id || contact.linq_chat_id;
    if (!conversationId) {
      return NextResponse.json(
        { data: null, error: { message: 'No conversation exists for this contact', code: 'NO_CONVERSATION' } },
        { status: 400 }
      );
    }

    const linePhone = contact.assigned_line
      ? SENDING_LINES.find(l => l.number === contact.assigned_line)?.phone || SENDING_LINES[0].phone
      : SENDING_LINES[0].phone;

    const result = await messaging.sendReply({
      contact_id: contact.id,
      conversation_id: conversationId,
      body: message,
      line_phone: linePhone,
    });

    return NextResponse.json({
      data: { success: result.success, error: result.error },
      error: result.success ? null : { message: result.error || 'Send failed', code: 'SEND_ERROR' },
    });
  } catch (err) {
    console.error('Error sending reply:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Failed to send reply', code: 'SERVER_ERROR' } },
      { status: 500 }
    );
  }
}
