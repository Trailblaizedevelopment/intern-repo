import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// GET /api/messages/conversations/[id] - Get messages for a conversation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;
    const supabase = getSupabaseAdmin();
    
    if (!supabase) {
      return NextResponse.json({ 
        data: null, 
        error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } 
      }, { status: 500 });
    }

    const employeeId = request.headers.get('x-employee-id');
    if (!employeeId) {
      return NextResponse.json({ 
        data: null, 
        error: { message: 'Employee ID required', code: 'MISSING_EMPLOYEE_ID' } 
      }, { status: 400 });
    }

    // Verify user is participant
    const { data: participant, error: partError } = await supabase
      .from('conversation_participants')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('employee_id', employeeId)
      .single();

    if (partError || !participant) {
      return NextResponse.json({ 
        data: null, 
        error: { message: 'Not authorized to view this conversation', code: 'UNAUTHORIZED' } 
      }, { status: 403 });
    }

    // Get pagination params
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50');
    const before = searchParams.get('before'); // cursor for pagination

    // Build query
    let query = supabase
      .from('messages')
      .select(`
        id,
        content,
        sender_id,
        message_type,
        metadata,
        is_edited,
        created_at,
        employees:sender_id (
          id,
          name,
          avatar_url
        )
      `)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt('created_at', before);
    }

    const { data: messages, error } = await query;

    if (error) {
      console.error('Error fetching messages:', error);
      return NextResponse.json({ 
        data: null, 
        error: { message: error.message, code: 'DB_ERROR' } 
      }, { status: 500 });
    }

    // Get read receipts for these messages
    const messageIds = messages?.map(m => m.id) || [];
    const { data: readReceipts } = await supabase
      .from('message_read_receipts')
      .select('message_id, employee_id, read_at')
      .in('message_id', messageIds);

    // Create a map of read receipts by message
    const readReceiptMap: Record<string, { employee_id: string; read_at: string }[]> = {};
    readReceipts?.forEach(receipt => {
      if (!readReceiptMap[receipt.message_id]) {
        readReceiptMap[receipt.message_id] = [];
      }
      readReceiptMap[receipt.message_id].push({
        employee_id: receipt.employee_id,
        read_at: receipt.read_at
      });
    });

    // Format messages with read status
    const formattedMessages = messages?.map(msg => {
      const receipts = readReceiptMap[msg.id] || [];
      const isReadByOthers = receipts.some(r => r.employee_id !== employeeId);
      
      // Handle employees relation - can be array or single object depending on Supabase config
      const employeeData = msg.employees as unknown as { name: string } | { name: string }[] | null;
      const senderName = Array.isArray(employeeData) 
        ? employeeData[0]?.name 
        : employeeData?.name;
      
      return {
        id: msg.id,
        content: msg.content,
        senderId: msg.sender_id,
        senderName: senderName || 'Unknown',
        messageType: msg.message_type,
        metadata: msg.metadata,
        isEdited: msg.is_edited,
        timestamp: msg.created_at,
        status: msg.sender_id === employeeId 
          ? (isReadByOthers ? 'read' : 'delivered')
          : 'received'
      };
    }).reverse() || []; // Reverse to get chronological order

    // Update last_read_at for the participant
    await supabase
      .from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('employee_id', employeeId);

    return NextResponse.json({ 
      data: formattedMessages, 
      error: null,
      hasMore: messages?.length === limit
    });
  } catch (err) {
    console.error('Error in conversation messages GET:', err);
    return NextResponse.json({ 
      data: null, 
      error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } 
    }, { status: 500 });
  }
}
