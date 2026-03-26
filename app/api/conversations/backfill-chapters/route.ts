/**
 * POST /api/conversations/backfill-chapters
 *
 * One-time (re-runnable) backfill: for all linq_conversations rows where
 * chapter_id IS NULL, resolve chapter_id + chapter_name by joining on
 * alumni_contacts.linq_chat_id → chapters.chapter_name, then PATCH the rows.
 *
 * Join path:
 *   linq_conversations.linq_chat_id
 *     → alumni_contacts.linq_chat_id (alumni_contacts.chapter_id)
 *     → chapters.id (chapters.chapter_name)
 *
 * Returns: { updated: N, skipped: N, errors: string[] }
 *
 * Requires: Authorization: Bearer <internal_token>
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const INTERNAL_TOKEN = 'hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h';
const BATCH = 50;

function checkAuth(req: NextRequest): boolean {
  return (req.headers.get('Authorization') || '') === `Bearer ${INTERNAL_TOKEN}`;
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
  let updated = 0;
  let skipped = 0;

  try {
    // ── Step 1: Fetch all linq_conversations with no chapter_id ──────────────
    // Paginate to handle > 1000 rows
    const allConvs: { id: string; linq_chat_id: string }[] = [];
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from('linq_conversations')
        .select('id, linq_chat_id')
        .is('chapter_id', null)
        .range(offset, offset + 999);

      if (error) {
        return NextResponse.json(
          { error: `Failed to fetch conversations: ${error.message}` },
          { status: 500 }
        );
      }
      if (!data || data.length === 0) break;
      allConvs.push(...(data as { id: string; linq_chat_id: string }[]));
      if (data.length < 1000) break;
      offset += 1000;
    }

    if (allConvs.length === 0) {
      return NextResponse.json({ updated: 0, skipped: 0, errors: [] });
    }

    // ── Step 2: Collect unique linq_chat_ids ──────────────────────────────────
    const uniqueChatIds = [...new Set(allConvs.map(c => c.linq_chat_id).filter(Boolean))];

    // ── Step 3: Batch query alumni_contacts by linq_chat_id ───────────────────
    const chatToChapterId = new Map<string, string>();   // linq_chat_id → chapter_id
    const chatToContactId = new Map<string, string>();   // linq_chat_id → contact id

    for (let i = 0; i < uniqueChatIds.length; i += BATCH) {
      const batch = uniqueChatIds.slice(i, i + BATCH);
      const { data, error } = await supabase
        .from('alumni_contacts')
        .select('id, linq_chat_id, chapter_id')
        .in('linq_chat_id', batch)
        .not('chapter_id', 'is', null);

      if (error) {
        errors.push(`alumni_contacts lookup batch ${Math.floor(i / BATCH) + 1}: ${error.message}`);
        continue;
      }

      for (const row of data ?? []) {
        if (row.linq_chat_id && row.chapter_id) {
          chatToChapterId.set(row.linq_chat_id, row.chapter_id);
          chatToContactId.set(row.linq_chat_id, row.id);
        }
      }
    }

    if (chatToChapterId.size === 0) {
      skipped = allConvs.length;
      return NextResponse.json({ updated: 0, skipped, errors, note: 'No alumni_contacts matched on linq_chat_id' });
    }

    // ── Step 4: Batch query chapters for names ────────────────────────────────
    const allChapterIds = [...new Set(chatToChapterId.values())];
    const chapterNameMap = new Map<string, string>();

    for (let i = 0; i < allChapterIds.length; i += BATCH) {
      const batch = allChapterIds.slice(i, i + BATCH);
      const { data, error } = await supabase
        .from('chapters')
        .select('id, chapter_name')
        .in('id', batch);

      if (error) {
        errors.push(`chapters lookup batch ${Math.floor(i / BATCH) + 1}: ${error.message}`);
        continue;
      }

      for (const ch of data ?? []) {
        if (ch.id && ch.chapter_name) chapterNameMap.set(ch.id, ch.chapter_name);
      }
    }

    // ── Step 5: PATCH each matched conversation ───────────────────────────────
    // Process in parallel batches of 20 to avoid hammering the API
    const PARALLEL = 20;
    const toUpdate = allConvs.filter(c => chatToChapterId.has(c.linq_chat_id));
    skipped = allConvs.length - toUpdate.length;

    for (let i = 0; i < toUpdate.length; i += PARALLEL) {
      const batch = toUpdate.slice(i, i + PARALLEL);

      await Promise.all(batch.map(async (conv) => {
        const chapterId   = chatToChapterId.get(conv.linq_chat_id)!;
        const chapterName = chapterNameMap.get(chapterId) ?? null;
        const contactId   = chatToContactId.get(conv.linq_chat_id) ?? null;

        const { error } = await supabase
          .from('linq_conversations')
          .update({ chapter_id: chapterId, chapter_name: chapterName, contact_id: contactId })
          .eq('id', conv.id);

        if (error) {
          errors.push(`conv ${conv.id}: ${error.message}`);
          skipped++;
        } else {
          updated++;
        }
      }));
    }

    return NextResponse.json({ updated, skipped, errors });
  } catch (err) {
    console.error('[backfill-chapters]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
