import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// GET /api/messages/conversations - Get all conversations for current user
export async function GET(request: NextRequest) {
  try {
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

    // Get all conversations with participants and last message
    const { data: conversations, error } = await supabase
      .from('conversation_participants')
      .select(`
        conversation_id,
        last_read_at,
        is_muted,
        conversations (
          id,
          name,
          is_group,
          created_at,
          updated_at
        )
      `)
      .eq('employee_id', employeeId);

    if (error) {
      console.error('Error fetching conversations:', error);
      return NextResponse.json({ 
        data: null, 
        error: { message: error.message, code: 'DB_ERROR' } 
      }, { status: 500 });
    }

    // For each conversation, get the other participants and last message
    const conversationsWithDetails = await Promise.all(
      (conversations || []).map(async (cp) => {
        // Handle conversations relation - can be array or single object depending on Supabase config
        const convData = cp.conversations as unknown as {
          id: string;
          name: string;
          is_group: boolean;
          created_at: string;
          updated_at: string;
        } | {
          id: string;
          name: string;
          is_group: boolean;
          created_at: string;
          updated_at: string;
        }[] | null;
        const conv = Array.isArray(convData) ? convData[0] : convData;
        
        if (!conv) return null;

        // Get other participants
        const { data: participants } = await supabase
          .from('conversation_participants')
          .select(`
            employee_id,
            employees (
              id,
              name,
              role,
              avatar_url,
              status
            )
          `)
          .eq('conversation_id', conv.id)
          .neq('employee_id', employeeId);

        // Get last message
        const { data: lastMessages } = await supabase
          .from('messages')
          .select('id, content, sender_id, created_at')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1);

        // Get unread count
        const { data: unreadMessages } = await supabase
          .from('messages')
          .select('id', { count: 'exact' })
          .eq('conversation_id', conv.id)
          .neq('sender_id', employeeId)
          .gt('created_at', cp.last_read_at || '1970-01-01');

        // Handle employees relation - can be array or single object depending on Supabase config
        const employeeData = participants?.[0]?.employees as unknown as {
          id: string;
          name: string;
          role: string;
          avatar_url: string;
          status: string;
        } | {
          id: string;
          name: string;
          role: string;
          avatar_url: string;
          status: string;
        }[] | null;
        const participant = Array.isArray(employeeData) ? employeeData[0] : employeeData;

        return {
          id: conv.id,
          name: conv.name,
          is_group: conv.is_group,
          participant: participant ? {
            id: participant.id,
            name: participant.name,
            role: participant.role,
            avatar_url: participant.avatar_url,
            isOnline: participant.status === 'active'
          } : null,
          lastMessage: lastMessages?.[0]?.content || null,
          lastMessageTime: lastMessages?.[0]?.created_at || null,
          unreadCount: unreadMessages?.length || 0,
          is_muted: cp.is_muted
        };
      })
    );

    // Filter out null values and sort by last message time
    const validConversations = conversationsWithDetails.filter(c => c !== null);
    validConversations.sort((a, b) => {
      if (!a!.lastMessageTime) return 1;
      if (!b!.lastMessageTime) return -1;
      return new Date(b!.lastMessageTime).getTime() - new Date(a!.lastMessageTime).getTime();
    });

    return NextResponse.json({ data: validConversations, error: null });
  } catch (err) {
    console.error('Error in conversations GET:', err);
    return NextResponse.json({ 
      data: null, 
      error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } 
    }, { status: 500 });
  }
}

// POST /api/messages/conversations - Create or get a conversation
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
    const { employeeId, participantId, isGroup, name, participantIds } = body;

    if (!employeeId) {
      return NextResponse.json({ 
        data: null, 
        error: { message: 'Employee ID required', code: 'MISSING_EMPLOYEE_ID' } 
      }, { status: 400 });
    }

    if (isGroup) {
      // Create group conversation
      if (!participantIds || participantIds.length < 2) {
        return NextResponse.json({ 
          data: null, 
          error: { message: 'Group requires at least 2 participants', code: 'INVALID_PARTICIPANTS' } 
        }, { status: 400 });
      }

      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .insert({
          name: name || 'Group Chat',
          is_group: true,
          created_by: employeeId
        })
        .select()
        .single();

      if (convError) {
        return NextResponse.json({ 
          data: null, 
          error: { message: convError.message, code: 'DB_ERROR' } 
        }, { status: 500 });
      }

      // Add all participants including creator
      const allParticipants = [...new Set([employeeId, ...participantIds])];
      const { error: partError } = await supabase
        .from('conversation_participants')
        .insert(allParticipants.map(id => ({
          conversation_id: conversation.id,
          employee_id: id
        })));

      if (partError) {
        return NextResponse.json({ 
          data: null, 
          error: { message: partError.message, code: 'DB_ERROR' } 
        }, { status: 500 });
      }

      return NextResponse.json({ data: { conversationId: conversation.id }, error: null });
    } else {
      // Get or create 1:1 conversation
      if (!participantId) {
        return NextResponse.json({ 
          data: null, 
          error: { message: 'Participant ID required for 1:1 chat', code: 'MISSING_PARTICIPANT' } 
        }, { status: 400 });
      }

      const { data, error } = await supabase
        .rpc('get_or_create_conversation', {
          p_employee_1: employeeId,
          p_employee_2: participantId
        });

      if (error) {
        return NextResponse.json({ 
          data: null, 
          error: { message: error.message, code: 'DB_ERROR' } 
        }, { status: 500 });
      }

      return NextResponse.json({ data: { conversationId: data }, error: null });
    }
  } catch (err) {
    console.error('Error in conversations POST:', err);
    return NextResponse.json({ 
      data: null, 
      error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } 
    }, { status: 500 });
  }
}
