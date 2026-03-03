import { NextRequest, NextResponse } from 'next/server';
import { messaging } from '@/lib/messaging';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/outreach/conversations?contact_id={id}
 * Returns message thread for a contact's conversation.
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { data: null, error: { message: 'Server configuration error', code: 'CONFIG_ERROR' } },
      { status: 500 }
    );
  }

  try {
    const contactId = request.nextUrl.searchParams.get('contact_id');
    if (!contactId) {
      return NextResponse.json(
        { data: null, error: { message: 'contact_id is required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const { data: contact, error } = await supabase
      .from('alumni_contacts')
      .select('id, provider_conversation_id, linq_chat_id, first_name, last_name, phone_primary, outreach_status, response_classification')
      .eq('id', contactId)
      .single();

    if (error || !contact) {
      return NextResponse.json(
        { data: null, error: { message: 'Contact not found', code: 'NOT_FOUND' } },
        { status: 404 }
      );
    }

    const conversationId = contact.provider_conversation_id || contact.linq_chat_id;
    if (!conversationId) {
      return NextResponse.json({
        data: { contact, messages: [] },
        error: null,
      });
    }

    const messages = await messaging.getConversation(conversationId);

    return NextResponse.json({
      data: { contact, messages },
      error: null,
    });
  } catch (err) {
    console.error('Error fetching conversation:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Failed to fetch conversation', code: 'SERVER_ERROR' } },
      { status: 500 }
    );
  }
}
