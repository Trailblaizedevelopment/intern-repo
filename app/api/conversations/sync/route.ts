/**
 * POST /api/conversations/sync
 * Light sync: pull latest from Linq across all lines, upsert new chats,
 * update last_message fields, set has_unread_reply, and auto-classify status.
 *
 * Classification rules (applied per conversation, based on inbound messages):
 *   - unresponsive: no inbound messages at all
 *   - active: most recent inbound is affirmative
 *   - flagged: most recent inbound is NOT affirmative
 *   - handled: NEVER auto-set (preserved from manual action)
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

// ── Affirmative detection ───────────────────────────────────────────────────
const AFFIRMATIVE = new Set([
  'yes', 'yep', 'yeah', 'yea', 'sure', 'correct',
  "that's me", 'thats me', 'absolutely', 'definitely',
  'yup', 'uh huh', 'mhm', 'for sure', 'sounds right',
  'right', "that's right", 'thats right',
]);

function isAffirmative(text: string): boolean {
  return AFFIRMATIVE.has(text.toLowerCase().trim());
}

type AutoStatus = 'active' | 'flagged' | 'unresponsive';

function classifyStatus(msgs: { is_from_me: boolean; parts: { type: string; value: string }[] }[]): AutoStatus {
  // Find inbound messages (messages not sent by us)
  const inbound = msgs.filter(m => !m.is_from_me);

  if (inbound.length === 0) {
    return 'unresponsive';
  }

  // msgs are newest-first, so find the first inbound (= most recent inbound)
  const mostRecent = inbound[0];
  const text = mostRecent.parts
    ?.find((p: { type: string; value: string }) => p.type === 'text')?.value ?? '';

  return isAffirmative(text) ? 'active' : 'flagged';
}

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

    // For each chat, fetch messages to determine status and last_message fields
    const upserts: Record<string, unknown>[] = [];
    // Map linq_chat_id → computed auto-status
    const statusMap: Record<string, AutoStatus> = {};

    await Promise.allSettled(
      allChats.map(async ({ chat, line }) => {
        try {
          // Fetch up to 20 messages to find recent inbound and classify
          const msgs = await getMessages(chat.id, 20);
          const lastMsg = msgs[0] ?? null;

          const isInbound = lastMsg ? !lastMsg.is_from_me : false;
          const lastMsgAt = lastMsg?.created_at ?? chat.updated_at;
          const autoStatus = classifyStatus(msgs);

          statusMap[chat.id] = autoStatus;

          upserts.push({
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
            updated_at: new Date().toISOString(),
          });
          processed++;
        } catch (err) {
          errors.push(`Chat ${chat.id}: ${String(err)}`);
        }
      })
    );

    // ── Batch upsert base fields (no status — preserve existing) ───────────
    const BATCH = 50;
    for (let i = 0; i < upserts.length; i += BATCH) {
      const batch = upserts.slice(i, i + BATCH);
      const { error } = await supabase
        .from('linq_conversations')
        .upsert(batch, { onConflict: 'linq_chat_id', ignoreDuplicates: false });
      if (error) {
        errors.push(`Upsert batch ${Math.floor(i / BATCH) + 1}: ${error.message}`);
      }
    }

    // ── Batch status updates — grouped by new status, never touch 'handled' ─
    const byStatus: Record<AutoStatus, string[]> = {
      active: [],
      flagged: [],
      unresponsive: [],
    };
    for (const [chatId, newStatus] of Object.entries(statusMap)) {
      byStatus[newStatus].push(chatId);
    }

    const now = new Date().toISOString();
    for (const [newStatus, chatIds] of Object.entries(byStatus) as [AutoStatus, string[]][]) {
      if (chatIds.length === 0) continue;

      // Process in batches to avoid URL length limits on .in()
      for (let i = 0; i < chatIds.length; i += BATCH) {
        const batchIds = chatIds.slice(i, i + BATCH);
        const { error } = await supabase
          .from('linq_conversations')
          .update({ status: newStatus, updated_at: now })
          .in('linq_chat_id', batchIds)
          .neq('status', 'handled'); // never overwrite manually handled

        if (error) {
          errors.push(`Status update (${newStatus}) batch ${Math.floor(i / BATCH) + 1}: ${error.message}`);
        }
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
