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

          const contactPhone = chat.handles.find(h => !h.is_me)?.handle ?? null;

          upserts.push({
            linq_chat_id: chat.id,
            line_phone: line.phone,
            line_label: line.label,
            contact_phone: contactPhone,
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

    // ── Enrich upserts with chapter_id + chapter_name ─────────────────────
    // Collect unique contact phones from all chats being upserted
    const contactPhones = [
      ...new Set(
        allChats
          .map(({ chat }) => {
            const h = chat.handles.find(h => !h.is_me);
            return h?.handle ?? null;
          })
          .filter((p): p is string => Boolean(p))
      ),
    ];

    const phoneToChapterId = new Map<string, string>();
    const chapterNameMap = new Map<string, string>();
    const BATCH = 50;

    if (contactPhones.length > 0) {
      // Batch query alumni_contacts for chapter_id
      for (let i = 0; i < contactPhones.length; i += BATCH) {
        const batch = contactPhones.slice(i, i + BATCH);
        const { data: contacts } = await supabase
          .from('alumni_contacts')
          .select('phone_primary, chapter_id')
          .in('phone_primary', batch);
        for (const c of contacts ?? []) {
          if (c.phone_primary && c.chapter_id) {
            phoneToChapterId.set(c.phone_primary, c.chapter_id);
          }
        }
      }

      // Batch query chapters for chapter_name
      const allChapterIds = [...new Set(phoneToChapterId.values())];
      for (let i = 0; i < allChapterIds.length; i += BATCH) {
        const batch = allChapterIds.slice(i, i + BATCH);
        const { data: chapters } = await supabase
          .from('chapters')
          .select('id, chapter_name')
          .in('id', batch);
        for (const ch of chapters ?? []) {
          if (ch.id && ch.chapter_name) chapterNameMap.set(ch.id, ch.chapter_name);
        }
      }

      // Add chapter fields to each upsert record
      for (const upsert of upserts) {
        const phone = upsert.contact_phone as string | undefined;
        if (!phone) continue;
        const chapterId = phoneToChapterId.get(phone);
        if (chapterId) {
          upsert.chapter_id = chapterId;
          upsert.chapter_name = chapterNameMap.get(chapterId) ?? null;
        }
      }
    }

    // ── Enrich upserts with contact_name from alumni_contacts ─────────────
    const upsertChatIds = [
      ...new Set(upserts.map(u => u.linq_chat_id as string).filter(Boolean)),
    ];

    if (upsertChatIds.length > 0) {
      const chatIdNameMap = new Map<string, string>();
      for (let i = 0; i < upsertChatIds.length; i += BATCH) {
        const batch = upsertChatIds.slice(i, i + BATCH);
        const { data: nameContacts } = await supabase
          .from('alumni_contacts')
          .select('linq_chat_id, first_name, last_name')
          .in('linq_chat_id', batch);
        for (const c of nameContacts ?? []) {
          if (c.linq_chat_id) {
            const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
            if (name) chatIdNameMap.set(c.linq_chat_id, name);
          }
        }
      }
      for (const upsert of upserts) {
        const chatId = upsert.linq_chat_id as string | undefined;
        if (chatId && chatIdNameMap.has(chatId)) {
          upsert.contact_name = chatIdNameMap.get(chatId);
        }
      }
    }

    // ── Batch upsert base fields (no status — preserve existing) ───────────
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
