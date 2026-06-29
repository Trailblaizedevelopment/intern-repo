/**
 * POST /api/conversations/sync
 * Sync Linq conversations into the linq_conversations table.
 *
 * - Fetches recent chats from all active lines
 * - Updates last_message fields, has_unread_reply, outreach_status, touch_stage
 * - Reverse sync: creates rows for any alumni_contacts with linq_chat_id missing from linq_conversations
 * - Never auto-classifies status based on message content (status is owned by the outreach pipeline)
 * - Preserves 'handled' status and clears has_unread_reply for handled conversations
 *
 * Requires: Authorization: Bearer <internal_token>
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { listChats, getMessages, LinqChat } from '@/lib/linq';
import { LINQ_LINES } from '@/lib/linq-recovery';

const INTERNAL_TOKEN = process.env.INTERNAL_API_KEY || '';

function checkAuth(req: NextRequest): boolean {
  return (req.headers.get('Authorization') || '') === `Bearer ${INTERNAL_TOKEN}`;
}

function touchStageFromStatus(status: string | null): string | null {
  if (!status) return null;
  if (status === 'touch1_sent' || status === 'touch1_confirmed') return 'T1';
  if (status === 'touch2_sent') return 'T2';
  if (status === 'touch3_sent') return 'T3';
  return null;
}

// Line number → phone mapping for reverse sync
const LINE_PHONE_MAP: Record<number, string> = {
  1: '+16462101111',
  2: '+16462178274',
  3: '+16462442696',
  4: '+14044239427',
  5: '+14045428435',
  6: '+19725590427',
  7: '+19725590438',
  8: '+15042234218',
  9: '+15042236050',
  10: '+12817773280',
  11: '+12817452268',
};

const LINE_LABEL_MAP: Record<number, string> = {
  1: 'Owen',
  2: 'Adam',
  3: 'Ford',
  4: 'Line 4',
  5: 'Line 5',
  6: 'Line 6',
  7: 'Line 7',
  8: 'Line 8',
  9: 'Line 9',
  10: 'Line 10',
  11: 'Line 11',
};

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
  const BATCH = 50;

  try {
    // ── Step 1: Fetch recent chats from all Linq lines ─────────────────────
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

    // ── Step 2: Fetch messages for each chat ──────────────────────────────
    const upserts: Record<string, unknown>[] = [];

    await Promise.allSettled(
      allChats.map(async ({ chat, line }) => {
        try {
          const msgs = await getMessages(chat.id, 20);
          const lastMsg = msgs[0] ?? null;

          const isInbound = lastMsg ? !lastMsg.is_from_me : false;
          const lastMsgAt = lastMsg?.created_at ?? chat.updated_at;
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

    // ── Step 3: Enrich with chapter_id, chapter_name ───────────────────────
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

    if (contactPhones.length > 0) {
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

    // ── Step 4: Enrich with contact_name, contact_id, outreach_status, touch_stage ──
    const upsertChatIds = [
      ...new Set(upserts.map(u => u.linq_chat_id as string).filter(Boolean)),
    ];

    if (upsertChatIds.length > 0) {
      const contactEnrichMap = new Map<string, {
        name: string;
        id: string;
        outreach_status: string | null;
      }>();

      for (let i = 0; i < upsertChatIds.length; i += BATCH) {
        const batch = upsertChatIds.slice(i, i + BATCH);
        const { data: enrichContacts } = await supabase
          .from('alumni_contacts')
          .select('linq_chat_id, first_name, last_name, id, outreach_status')
          .in('linq_chat_id', batch);

        for (const c of enrichContacts ?? []) {
          if (c.linq_chat_id) {
            const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
            contactEnrichMap.set(c.linq_chat_id, {
              name: name || '',
              id: c.id,
              outreach_status: c.outreach_status ?? null,
            });
          }
        }
      }

      for (const upsert of upserts) {
        const chatId = upsert.linq_chat_id as string | undefined;
        if (!chatId) continue;
        const enriched = contactEnrichMap.get(chatId);
        if (enriched) {
          if (enriched.name) upsert.contact_name = enriched.name;
          upsert.contact_id = enriched.id;
          upsert.outreach_status = enriched.outreach_status;
          upsert.touch_stage = touchStageFromStatus(enriched.outreach_status);
        }
      }
    }

    // ── Step 5: Batch upsert (no status field — preserves existing status) ─
    for (let i = 0; i < upserts.length; i += BATCH) {
      const batch = upserts.slice(i, i + BATCH);
      const { error } = await supabase
        .from('linq_conversations')
        .upsert(batch, { onConflict: 'linq_chat_id', ignoreDuplicates: false });
      if (error) {
        errors.push(`Upsert batch ${Math.floor(i / BATCH) + 1}: ${error.message}`);
      }
    }

    // ── Step 6: Reset has_unread_reply for 'handled' conversations ─────────
    // The upsert may have set has_unread_reply=true on handled convs; correct that.
    const inboundChatIds = upserts
      .filter(u => u.has_unread_reply === true)
      .map(u => u.linq_chat_id as string)
      .filter(Boolean);

    if (inboundChatIds.length > 0) {
      for (let i = 0; i < inboundChatIds.length; i += BATCH) {
        const batch = inboundChatIds.slice(i, i + BATCH);
        await supabase
          .from('linq_conversations')
          .update({ has_unread_reply: false })
          .in('linq_chat_id', batch)
          .eq('status', 'handled');
      }
    }

    // ── Step 7: Reverse sync — create rows for any alumni_contacts with ────
    // linq_chat_id that don't have a corresponding linq_conversations row yet.
    const alreadyUpsertedChatIds = new Set(upserts.map(u => u.linq_chat_id as string).filter(Boolean));

    const { data: linkedContacts } = await supabase
      .from('alumni_contacts')
      .select('id, linq_chat_id, first_name, last_name, phone_primary, outreach_status, chapter_id, assigned_line')
      .not('linq_chat_id', 'is', null)
      .limit(5000);

    const missingContacts = (linkedContacts || []).filter(
      c => c.linq_chat_id && !alreadyUpsertedChatIds.has(c.linq_chat_id)
    );

    if (missingContacts.length > 0) {
      // Fetch chapter names for missing contacts
      const missingChapterIds = [...new Set(missingContacts.map(c => c.chapter_id).filter(Boolean) as string[])];
      const missingChapterNameMap = new Map<string, string>();

      for (let i = 0; i < missingChapterIds.length; i += BATCH) {
        const batch = missingChapterIds.slice(i, i + BATCH);
        const { data: chaps } = await supabase
          .from('chapters')
          .select('id, chapter_name')
          .in('id', batch);
        for (const ch of chaps ?? []) {
          if (ch.id && ch.chapter_name) missingChapterNameMap.set(ch.id, ch.chapter_name);
        }
      }

      const reverseUpserts = missingContacts.map(c => ({
        linq_chat_id: c.linq_chat_id,
        line_phone: c.assigned_line ? LINE_PHONE_MAP[c.assigned_line as number] ?? null : null,
        line_label: c.assigned_line ? LINE_LABEL_MAP[c.assigned_line as number] ?? null : null,
        contact_id: c.id,
        contact_name: [c.first_name, c.last_name].filter(Boolean).join(' ') || null,
        contact_phone: c.phone_primary,
        chapter_id: c.chapter_id ?? null,
        chapter_name: c.chapter_id ? missingChapterNameMap.get(c.chapter_id) ?? null : null,
        outreach_status: c.outreach_status ?? null,
        touch_stage: touchStageFromStatus(c.outreach_status ?? null),
        status: 'active',
        has_unread_reply: false,
        is_urgent: false,
        updated_at: new Date().toISOString(),
      }));

      // ignoreDuplicates: true — only inserts new rows, never overwrites existing
      for (let i = 0; i < reverseUpserts.length; i += BATCH) {
        const batch = reverseUpserts.slice(i, i + BATCH);
        const { error } = await supabase
          .from('linq_conversations')
          .upsert(batch, { onConflict: 'linq_chat_id', ignoreDuplicates: true });
        if (error) {
          errors.push(`Reverse sync batch ${Math.floor(i / BATCH) + 1}: ${error.message}`);
        }
      }
    }

    return NextResponse.json({
      data: {
        processed,
        total: allChats.length,
        reverse_synced: missingContacts.length,
        errors,
      },
    });
  } catch (err) {
    console.error('[conversations/sync]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
