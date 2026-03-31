import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// POST /api/messages/read - Mark messages as read
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
    const { employeeId, conversationId, messageIds } = body;

    if (!employeeId || !conversationId) {
      return NextResponse.json({ 
        data: null, 
        error: { message: 'Missing required fields', code: 'MISSING_FIELDS' } 
      }, { status: 400 });
    }

    // Verify employee is participant
    const { data: participant, error: partError } = await supabase
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('employee_id', employeeId)
      .single();

    if (partError || !participant) {
      return NextResponse.json({ 
        data: null, 
        error: { message: 'Not authorized', code: 'UNAUTHORIZED' } 
      }, { status: 403 });
    }

    // Update last_read_at for the participant
    await supabase
      .from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('employee_id', employeeId);

    // If specific message IDs provided, create read receipts
    if (messageIds && messageIds.length > 0) {
      // First check which messages don't have receipts yet
      const { data: existingReceipts } = await supabase
        .from('message_read_receipts')
        .select('message_id')
        .in('message_id', messageIds)
        .eq('employee_id', employeeId);

      const existingMessageIds = new Set(existingReceipts?.map(r => r.message_id) || []);
      const newMessageIds = messageIds.filter((id: string) => !existingMessageIds.has(id));

      if (newMessageIds.length > 0) {
        await supabase
          .from('message_read_receipts')
          .insert(newMessageIds.map((messageId: string) => ({
            message_id: messageId,
            employee_id: employeeId
          })));
      }
    }

    return NextResponse.json({ data: { success: true }, error: null });
  } catch (err) {
    console.error('Error in messages read POST:', err);
    return NextResponse.json({ 
      data: null, 
      error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } 
    }, { status: 500 });
  }
}
