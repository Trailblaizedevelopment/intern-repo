import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendMessage } from '@/lib/linq';
import { generateScoutMessage } from '@/lib/scout/generate';

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
    // #region agent log
    console.log('[DEBUG f7e208] Webhook POST hit');
    fetch('http://127.0.0.1:7876/ingest/5884e2cc-023b-4455-ab41-0f188e22717a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f7e208'},body:JSON.stringify({sessionId:'f7e208',location:'webhooks/linq/route.ts:POST-entry',message:'Webhook POST hit',data:{},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    const supabase = getSupabaseAdmin();
    // #region agent log
    console.log('[DEBUG f7e208] H3: supabase admin', JSON.stringify({ hasSupabase: !!supabase, hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL, hasKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY }));
    fetch('http://127.0.0.1:7876/ingest/5884e2cc-023b-4455-ab41-0f188e22717a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f7e208'},body:JSON.stringify({sessionId:'f7e208',location:'webhooks/linq/route.ts:supabase-check',message:'H3 supabase admin check',data:{hasSupabase:!!supabase,hasUrl:!!process.env.NEXT_PUBLIC_SUPABASE_URL,hasKey:!!process.env.SUPABASE_SERVICE_ROLE_KEY},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (!supabase) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json();
    // Linq uses an envelope format: actual message data is in body.data
    const payload = body.data || body;

    // Ignore non-message events (typing indicators, read receipts, etc.)
    if (body.event_type && body.event_type !== 'message.received' && body.event_type !== 'message.created') {
      // #region agent log
      console.log('[DEBUG f7e208] Ignoring non-message event:', body.event_type);
      // #endregion
      return NextResponse.json({ status: 'ignored', reason: `event_type: ${body.event_type}` });
    }

    // #region agent log
    console.log('[DEBUG f7e208] H4: parsed body', JSON.stringify({ eventType: body.event_type, dataKeys: body.data ? Object.keys(body.data) : 'no-data', from: payload.from, senderHandle: payload.sender_handle, chatType: typeof payload.chat, chatId: payload.chat_id || (typeof payload.chat === 'object' ? payload.chat?.id : payload.chat) || payload.id, hasMessage: !!payload.message, hasParts: !!payload.parts }));
    fetch('http://127.0.0.1:7876/ingest/5884e2cc-023b-4455-ab41-0f188e22717a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f7e208'},body:JSON.stringify({sessionId:'f7e208',location:'webhooks/linq/route.ts:body-parse',message:'H4 body parsing fixed',data:{eventType:body.event_type,from:payload.from,senderHandle:payload.sender_handle,chatType:typeof payload.chat,chatId:payload.chat_id||(typeof payload.chat==='object'?payload.chat?.id:payload.chat)||payload.id},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    const chatId = payload.chat_id || (typeof payload.chat === 'object' ? payload.chat?.id : payload.chat) || payload.id;
    const fromPhone = payload.from || (typeof payload.sender_handle === 'object' ? payload.sender_handle?.handle : payload.sender_handle);
    const toPhone = payload.to || (typeof payload.chat === 'object' ? payload.chat?.handles?.find((h: { is_me: boolean }) => h.is_me)?.handle : undefined);
    const messageParts = payload.message?.parts || payload.parts || [];
    const messageText = messageParts.find((p: { type: string; value: string }) => p.type === 'text')?.value || '';
    const createdAt = payload.sent_at || payload.created_at || body.created_at || new Date().toISOString();

    if (!fromPhone || !messageText) {
      // #region agent log
      console.log('[DEBUG f7e208] H4: REJECTED - missing from or message', JSON.stringify({ fromPhone, messageText: messageText?.substring(0, 30) }));
      fetch('http://127.0.0.1:7876/ingest/5884e2cc-023b-4455-ab41-0f188e22717a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f7e208'},body:JSON.stringify({sessionId:'f7e208',location:'webhooks/linq/route.ts:missing-fields',message:'H4 REJECTED missing from or message',data:{fromPhone,messageText:messageText?.substring(0,30)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return NextResponse.json({ error: 'Missing from or message' }, { status: 400 });
    }

    // Sandbox guard: only process if sender is in scout_profiles
    // Use digit-based matching to handle various stored phone formats
    const normalizedFrom = normalizeToE164(fromPhone);
    const rawDigits = fromPhone.replace(/\D/g, '').slice(-10);
    const { data: matchedProfiles } = await supabase
      .from('scout_profiles')
      .select('id, phone_number, opt_in_status')
      .or(`phone_number.eq.${fromPhone},phone_number.eq.${normalizedFrom},phone_number.eq.${rawDigits},phone_number.like.%${rawDigits}%`)
      .limit(1);

    const profile = matchedProfiles?.[0] || null;

    // #region agent log
    console.log('[DEBUG f7e208] Profile lookup result', JSON.stringify({ found: !!profile, fromPhone, normalizedFrom, rawDigits, profileId: profile?.id, storedPhone: profile?.phone_number }));
    fetch('http://127.0.0.1:7876/ingest/5884e2cc-023b-4455-ab41-0f188e22717a',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f7e208'},body:JSON.stringify({sessionId:'f7e208',location:'webhooks/linq/route.ts:profile-lookup',message:'Profile lookup result',data:{found:!!profile,fromPhone,normalizedFrom,rawDigits,profileId:profile?.id,storedPhone:profile?.phone_number},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    if (!profile) {
      return NextResponse.json({ status: 'ignored', reason: 'sender not in scout_profiles' });
    }

    // Check for opt-out keywords
    const shouldFlag = containsOptOut(messageText);

    // Insert inbound conversation record
    const { error: insertErr } = await supabase
      .from('scout_conversations')
      .insert({
        profile_id: profile.id,
        phone_number: fromPhone,
        linq_line: toPhone || '',
        linq_chat_id: chatId || null,
        direction: 'inbound',
        message_body: messageText,
        read: false,
        flagged: shouldFlag,
        flag_reason: shouldFlag ? 'Auto-flagged: opt-out keyword detected' : null,
        created_at: createdAt,
      });

    if (insertErr) {
      console.error('[POST /api/webhooks/linq] Insert error:', insertErr.message);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    // Update profile's last_contact
    await supabase
      .from('scout_profiles')
      .update({
        last_contact: createdAt,
        updated_at: new Date().toISOString(),
        ...(shouldFlag ? { opt_in_status: 'opted_out' } : {}),
      })
      .eq('id', profile.id);

    // Auto-reply if not flagged and not opted out
    let autoReplied = false;
    if (!shouldFlag && profile.opt_in_status !== 'opted_out') {
      const result = await generateScoutMessage(profile.id, 'reply');
      const reply = result.message;

      if (reply) {
        try {
          if (chatId) {
            await sendMessage(chatId, reply, toPhone);
          }

          // Insert outbound reply record
          await supabase
            .from('scout_conversations')
            .insert({
              profile_id: profile.id,
              phone_number: fromPhone,
              linq_line: toPhone || '',
              linq_chat_id: chatId || null,
              direction: 'outbound',
              message_body: reply,
              read: true,
            });

          autoReplied = true;
        } catch (sendErr) {
          console.error('[POST /api/webhooks/linq] Auto-reply send error:', sendErr);
        }
      }
    }

    return NextResponse.json(
      { status: 'processed', flagged: shouldFlag, auto_replied: autoReplied },
      { status: 201 }
    );
  } catch (err) {
    console.error('[POST /api/webhooks/linq] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
