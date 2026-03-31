import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// POST /api/messages - Send a new message
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ 
        data: null, 
        error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } 
      }, { status: 500 });
    }

    const body = await request.json();
    const { conversationId, senderId, content, messageType = 'text', metadata = {} } = body;

    if (!conversationId || !senderId || !content) {
      return NextResponse.json({ 
        data: null, 
        error: { message: 'Missing required fields', code: 'MISSING_FIELDS' } 
      }, { status: 400 });
    }

    // Verify sender is participant
    const { data: participant, error: partError } = await supabase
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('employee_id', senderId)
      .single();

    if (partError || !participant) {
      return NextResponse.json({ 
        data: null, 
        error: { message: 'Not authorized to send messages in this conversation', code: 'UNAUTHORIZED' } 
      }, { status: 403 });
    }

    // Insert message
    const { data: message, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        content: content.trim(),
        message_type: messageType,
        metadata
      })
      .select(`
        id,
        content,
        sender_id,
        message_type,
        metadata,
        created_at
      `)
      .single();

    if (error) {
      console.error('Error sending message:', error);
      return NextResponse.json({ 
        data: null, 
        error: { message: error.message, code: 'DB_ERROR' } 
      }, { status: 500 });
    }

    // Update conversation updated_at
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    // Update sender's last_read_at
    await supabase
      .from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('employee_id', senderId);

    return NextResponse.json({ 
      data: {
        id: message.id,
        content: message.content,
        senderId: message.sender_id,
        messageType: message.message_type,
        metadata: message.metadata,
        timestamp: message.created_at,
        status: 'sent'
      }, 
      error: null 
    });
  } catch (err) {
    console.error('Error in messages POST:', err);
    return NextResponse.json({ 
      data: null, 
      error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } 
    }, { status: 500 });
  }
}

// PATCH /api/messages - Edit a message
export async function PATCH(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ 
        data: null, 
        error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } 
      }, { status: 500 });
    }

    const body = await request.json();
    const { messageId, senderId, content } = body;

    if (!messageId || !senderId || !content) {
      return NextResponse.json({ 
        data: null, 
        error: { message: 'Missing required fields', code: 'MISSING_FIELDS' } 
      }, { status: 400 });
    }

    // Verify sender owns the message
    const { data: existingMessage, error: msgError } = await supabase
      .from('messages')
      .select('id, sender_id')
      .eq('id', messageId)
      .single();

    if (msgError || !existingMessage) {
      return NextResponse.json({ 
        data: null, 
        error: { message: 'Message not found', code: 'NOT_FOUND' } 
      }, { status: 404 });
    }

    if (existingMessage.sender_id !== senderId) {
      return NextResponse.json({ 
        data: null, 
        error: { message: 'Not authorized to edit this message', code: 'UNAUTHORIZED' } 
      }, { status: 403 });
    }

    // Update message
    const { data: message, error } = await supabase
      .from('messages')
      .update({
        content: content.trim(),
        is_edited: true,
        edited_at: new Date().toISOString()
      })
      .eq('id', messageId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ 
        data: null, 
        error: { message: error.message, code: 'DB_ERROR' } 
      }, { status: 500 });
    }

    return NextResponse.json({ data: message, error: null });
  } catch (err) {
    console.error('Error in messages PATCH:', err);
    return NextResponse.json({ 
      data: null, 
      error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } 
    }, { status: 500 });
  }
}

// DELETE /api/messages - Delete a message (soft delete by clearing content)
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ 
        data: null, 
        error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } 
      }, { status: 500 });
    }

    const searchParams = request.nextUrl.searchParams;
    const messageId = searchParams.get('messageId');
    const senderId = searchParams.get('senderId');

    if (!messageId || !senderId) {
      return NextResponse.json({ 
        data: null, 
        error: { message: 'Missing required fields', code: 'MISSING_FIELDS' } 
      }, { status: 400 });
    }

    // Verify sender owns the message
    const { data: existingMessage, error: msgError } = await supabase
      .from('messages')
      .select('id, sender_id')
      .eq('id', messageId)
      .single();

    if (msgError || !existingMessage) {
      return NextResponse.json({ 
        data: null, 
        error: { message: 'Message not found', code: 'NOT_FOUND' } 
      }, { status: 404 });
    }

    if (existingMessage.sender_id !== senderId) {
      return NextResponse.json({ 
        data: null, 
        error: { message: 'Not authorized to delete this message', code: 'UNAUTHORIZED' } 
      }, { status: 403 });
    }

    // Soft delete by updating content
    const { error } = await supabase
      .from('messages')
      .update({
        content: 'This message was deleted',
        message_type: 'deleted',
        metadata: { deleted_at: new Date().toISOString() }
      })
      .eq('id', messageId);

    if (error) {
      return NextResponse.json({ 
        data: null, 
        error: { message: error.message, code: 'DB_ERROR' } 
      }, { status: 500 });
    }

    return NextResponse.json({ data: { success: true }, error: null });
  } catch (err) {
    console.error('Error in messages DELETE:', err);
    return NextResponse.json({ 
      data: null, 
      error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } 
    }, { status: 500 });
  }
}
