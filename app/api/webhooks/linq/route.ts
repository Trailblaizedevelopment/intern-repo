import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendMessage } from '@/lib/linq';
import { generateScoutMessage } from '@/lib/scout/generate';
import { clearFollowupSchedule, cancelPendingFollowups, scheduleAfterOutbound } from '@/lib/scout/followup';

const OPT_OUT_KEYWORDS = ['stop', 'unsubscribe', 'remove me', 'opt out', 'leave me alone', 'do not contact'];

function normalizeToE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (phone.startsWith('+')) return phone;
  return `+${digits}`;
}

function containsOptOut(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return OPT_OUT_KEYWORDS.some(kw => lower.includes(kw));
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json();
    // Linq uses an envelope format: actual message data is in body.data
    const payload = body.data || body;

    // Only process real inbound messages — message.created often duplicates message.received
    if (body.event_type && body.event_type !== 'message.received') {
      return NextResponse.json({ status: 'ignored', reason: `event_type: ${body.event_type}` });
    }

    const chatId = payload.chat_id || (typeof payload.chat === 'object' ? payload.chat?.id : payload.chat) || payload.id;
    const fromPhone = payload.from || (typeof payload.sender_handle === 'object' ? payload.sender_handle?.handle : payload.sender_handle);
    const toPhone = payload.to || (typeof payload.chat === 'object' ? payload.chat?.handles?.find((h: { is_me: boolean }) => h.is_me)?.handle : undefined);
    const messageParts = payload.message?.parts || payload.parts || [];
    const messageText = messageParts.find((p: { type: string; value: string }) => p.type === 'text')?.value || '';
    const createdAt = payload.sent_at || payload.created_at || body.created_at || new Date().toISOString();
    const linqMessageId =
      (typeof payload.id === 'string' && payload.id) ||
      (typeof body.data?.id === 'string' && body.data.id) ||
      null;

    if (!fromPhone || !messageText) {
      return NextResponse.json({ error: 'Missing from or message' }, { status: 400 });
    }

    // Sandbox guard: only process if sender is in scout_profiles
    const normalizedFrom = normalizeToE164(fromPhone);
    const rawDigits = fromPhone.replace(/\D/g, '').slice(-10);
    const { data: matchedProfiles } = await supabase
      .from('scout_profiles')
      .select('id, phone_number, opt_in_status')
      .or(`phone_number.eq.${fromPhone},phone_number.eq.${normalizedFrom},phone_number.eq.${rawDigits},phone_number.like.%${rawDigits}%`)
      .limit(1);

    const profile = matchedProfiles?.[0] || null;

    if (!profile) {
      return NextResponse.json({ status: 'ignored', reason: 'sender not in scout_profiles' });
    }

    // Primary dedupe: linq_message_id
    if (linqMessageId) {
      const { data: byMsgId } = await supabase
        .from('scout_conversations')
        .select('id')
        .eq('linq_message_id', linqMessageId)
        .limit(1);
      if (byMsgId && byMsgId.length > 0) {
        return NextResponse.json({ status: 'ignored', reason: 'duplicate_linq_message_id' });
      }
    }

    // Backup dedupe: same inbound body within 90s
    const dedupeSince = new Date(Date.now() - 90_000).toISOString();
    const { data: recentDupes } = await supabase
      .from('scout_conversations')
      .select('id')
      .eq('profile_id', profile.id)
      .eq('direction', 'inbound')
      .eq('message_body', messageText)
      .gte('created_at', dedupeSince)
      .limit(1);

    if (recentDupes && recentDupes.length > 0) {
      return NextResponse.json({ status: 'ignored', reason: 'duplicate_inbound' });
    }

    const shouldFlag = containsOptOut(messageText);

    const { error: insertErr } = await supabase
      .from('scout_conversations')
      .insert({
        profile_id: profile.id,
        phone_number: fromPhone,
        linq_line: toPhone || '',
        linq_chat_id: chatId || null,
        linq_message_id: linqMessageId,
        direction: 'inbound',
        message_body: messageText,
        read: false,
        flagged: shouldFlag,
        flag_reason: shouldFlag ? 'Auto-flagged: opt-out keyword detected' : null,
        created_at: createdAt,
      });

    if (insertErr) {
      // Unique violation on linq_message_id = concurrent duplicate
      if (insertErr.code === '23505') {
        return NextResponse.json({ status: 'ignored', reason: 'duplicate_linq_message_id' });
      }
      console.error('[POST /api/webhooks/linq] Insert error:', insertErr.message);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    if (shouldFlag) {
      await cancelPendingFollowups(profile.id);
      await supabase
        .from('scout_profiles')
        .update({
          last_contact: createdAt,
          updated_at: new Date().toISOString(),
          opt_in_status: 'opted_out',
          next_followup: null,
        })
        .eq('id', profile.id);
    } else {
      await supabase
        .from('scout_profiles')
        .update({
          last_contact: createdAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);
      await clearFollowupSchedule(profile.id);
    }

    let autoReplied = false;
    let generateSkipReason: string | undefined;
    if (!shouldFlag && profile.opt_in_status !== 'opted_out') {
      try {
        const result = await generateScoutMessage(profile.id, 'reply');
        const reply = result.message;

        if (reply) {
          try {
            if (chatId) {
              await sendMessage(chatId, reply, toPhone);
            }

            await supabase.from('scout_conversations').insert({
              profile_id: profile.id,
              phone_number: fromPhone,
              linq_line: toPhone || '',
              linq_chat_id: chatId || null,
              direction: 'outbound',
              message_body: reply,
              read: true,
            });

            await scheduleAfterOutbound(profile.id);
            autoReplied = true;
          } catch (sendErr) {
            console.error('[POST /api/webhooks/linq] Auto-reply send error:', sendErr);
          }
        } else {
          generateSkipReason = result.reason;
          console.warn('[POST /api/webhooks/linq] generate skip:', result.reason || 'unknown');
        }
      } catch (genErr) {
        // Log and return 201 without double-send
        console.error('[POST /api/webhooks/linq] Generate error:', genErr);
      }
    }

    return NextResponse.json(
      {
        status: 'processed',
        flagged: shouldFlag,
        auto_replied: autoReplied,
        skip_reason: generateSkipReason,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[POST /api/webhooks/linq] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
