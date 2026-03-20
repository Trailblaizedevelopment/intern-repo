/**
 * POST /api/conversations/sync
 * Light sync: pull latest from Linq across all lines, upsert new chats,
 * update last_message fields, set has_unread_reply and is_urgent flags.
 *
 * Requires: Authorization: Bearer <internal_token>
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { listChats, getMessages, LinqChat } from '@/lib/linq';
import { LINQ_LINES } from '@/lib/linq-recovery';

const INTERNAL_TOKEN = 'hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h';

function checkAuth(req: NextRequest): boolean {
  return (req.headers.get('Authorization') || '') === `Bearer ${INTERNAL_TOKEN}`;
}

const URGENT_THRESHOLD_MS = 48 * 60 * 60 * 1000; // 48 hours

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 500 });
  }

  const errors: string[] = [];
  let processed = 0;

  try {
    // Fetch most recent chats (1 page per line = up to 150) for quick sync
    const allChats: Array<{ chat: LinqChat; line: typeof LINQ_LINES[number] }> = [];

    await Promise.allSettled(
      LINQ_LINES.map(async line => {
        try {
          const page = await listChats(line.phone, 150);
          for (const chat of page.chats) {
            allChats.push({ chat, line });
          }
        } catch (err) {
          errors.push(`${line.label}: ${String(err)}`);
        }
      })
    );

    // For each chat, fetch last message to determine direction
    const updates: Record<string, unknown>[] = [];

    await Promise.allSettled(
      allChats.map(async ({ chat, line }) => {
        try {
          const msgs = await getMessages(chat.id, 1);
          const lastMsg = msgs[0] ?? null;

          const isInbound = lastMsg ? !lastMsg.is_from_me : false;
          const lastMsgAt = lastMsg?.created_at ?? chat.updated_at;
          const isOld = lastMsgAt
            ? Date.now() - new Date(lastMsgAt).getTime() > URGENT_THRESHOLD_MS
            : false;
          const isUrgent = isInbound && isOld;

          updates.push({
            linq_chat_id: chat.id,
            line_phone: line.phone,
            line_label: line.label,
            last_message_at: lastMsgAt,
            last_message_text: lastMsg
              ? (lastMsg.parts?.find((p: { type: string; value: string }) => p.type === 'text')?.value ?? null)
              : null,
            last_message_direction: lastMsg
              ? (lastMsg.is_from_me ? 'outbound' : 'inbound')
              : null,
            has_unread_reply: isInbound,
            is_urgent: isUrgent,
            updated_at: new Date().toISOString(),
          });
          processed++;
        } catch (err) {
          errors.push(`Chat ${chat.id}: ${String(err)}`);
        }
      })
    );

    // Batch upsert (only fields we know — don't overwrite status/flagged_reason)
    const BATCH = 50;
    for (let i = 0; i < updates.length; i += BATCH) {
      const batch = updates.slice(i, i + BATCH);
      const { error } = await supabase
        .from('linq_conversations')
        .upsert(batch, { onConflict: 'linq_chat_id', ignoreDuplicates: false });
      if (error) {
        errors.push(`Sync upsert batch ${Math.floor(i / BATCH) + 1}: ${error.message}`);
      }
    }

    return NextResponse.json({
      data: { processed, total: allChats.length, errors },
    });
  } catch (err) {
    console.error('[conversations/sync]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
