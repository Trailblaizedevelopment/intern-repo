import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendMessage, createChat } from '@/lib/linq';
import { generateScoutMessage } from '@/lib/scout/generate';
import { scheduleAfterOutbound } from '@/lib/scout/followup';

function normalizeToE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (phone.startsWith('+')) return phone;
  return `+${digits}`;
}

export { generateScoutMessage };

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { chat_id, to_phone, from_phone, auto_generate, profile_id } = body;
    let { message } = body;

    if (!from_phone) {
      return NextResponse.json(
        { data: null, error: { message: 'from_phone is required', code: 'MISSING_FIELDS' } },
        { status: 400 }
      );
    }

    // Auto-generate message via Scout agent if requested
    if (auto_generate && profile_id) {
      const type = message ? 'reply' : 'open';
      const result = await generateScoutMessage(profile_id, type);
      if (!result.message) {
        return NextResponse.json(
          {
            data: null,
            error: {
              message: result.reason === 'max_unanswered_followups'
                ? 'Skipped: max unanswered follow-ups'
                : 'Failed to generate message',
              code: result.reason === 'max_unanswered_followups' ? 'SKIPPED' : 'AI_ERROR',
            },
          },
          { status: result.reason === 'max_unanswered_followups' ? 200 : 502 }
        );
      }
      message = result.message;
    }

    if (!message) {
      return NextResponse.json(
        { data: null, error: { message: 'message is required (or set auto_generate: true)', code: 'MISSING_FIELDS' } },
        { status: 400 }
      );
    }

    if (!chat_id && !to_phone) {
      return NextResponse.json(
        { data: null, error: { message: 'Either chat_id or to_phone is required', code: 'MISSING_FIELDS' } },
        { status: 400 }
      );
    }

    let linqChatId = chat_id;
    let recipientPhone = to_phone ? normalizeToE164(to_phone) : to_phone;

    if (chat_id) {
      await sendMessage(chat_id, message, from_phone);
    } else {
      const chat = await createChat(from_phone, recipientPhone, message);
      linqChatId = chat.id;
    }

    // Resolve profile_id from phone number
    if (!recipientPhone && linqChatId) {
      const { data: existingMsg } = await supabase
        .from('scout_conversations')
        .select('phone_number')
        .eq('linq_chat_id', linqChatId)
        .limit(1)
        .single();
      recipientPhone = existingMsg?.phone_number || to_phone;
    }

    let resolvedProfileId: string | null = profile_id || null;
    if (!resolvedProfileId && recipientPhone) {
      const { data: profile } = await supabase
        .from('scout_profiles')
        .select('id')
        .eq('phone_number', recipientPhone)
        .single();
      resolvedProfileId = profile?.id || null;
    }

    // Insert outbound record
    const { data: convo, error: convoErr } = await supabase
      .from('scout_conversations')
      .insert({
        phone_number: recipientPhone || '',
        linq_line: from_phone,
        linq_chat_id: linqChatId,
        direction: 'outbound',
        message_body: message,
        profile_id: resolvedProfileId,
        read: true,
      })
      .select()
      .single();

    if (convoErr) {
      console.error('[POST /api/scout/send] DB insert error:', convoErr.message);
      return NextResponse.json(
        { data: null, error: { message: convoErr.message, code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    if (resolvedProfileId) {
      await scheduleAfterOutbound(resolvedProfileId);
    }

    return NextResponse.json({ data: convo, error: null }, { status: 201 });
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : 'Internal server error';
    console.error('[POST /api/scout/send] Error:', errMessage);
    return NextResponse.json(
      { data: null, error: { message: errMessage, code: 'SEND_FAILED' } },
      { status: 500 }
    );
  }
}
