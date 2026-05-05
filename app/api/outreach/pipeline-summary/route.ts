import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/outreach/pipeline-summary
 *
 * Returns per-chapter outreach stats aggregated from alumni_contacts.
 * Also returns chapters with zero contacts (Not Started).
 *
 * Response:
 * {
 *   data: ChapterPipelineRow[],
 *   error: null
 * }
 *
 * ChapterPipelineRow:
 * {
 *   chapter_id: string
 *   chapter_name: string
 *   fraternity: string | null
 *   school: string | null
 *   total: number       — total alumni_contacts rows for this chapter
 *   sent: number        — touch1_sent_at IS NOT NULL
 *   replied: number     — last_response_at IS NOT NULL
 *   linked: number      — outreach_status IN ('pitched','touch2_sent','touch3_sent')
 *   signed_up: number   — outreach_status = 'signed_up'
 *   status: 'not_started' | 'active' | 'done'
 * }
 */
export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } },
      { status: 500 },
    );
  }

  try {
    // 1. Fetch all chapters
    const { data: chapters, error: chaptersError } = await supabase
      .from('chapters')
      .select('id, chapter_name, fraternity, school')
      .order('chapter_name', { ascending: true });

    if (chaptersError) {
      return NextResponse.json(
        { data: null, error: { message: chaptersError.message, code: 'DB_ERROR' } },
        { status: 500 },
      );
    }

    if (!chapters || chapters.length === 0) {
      return NextResponse.json({ data: [], error: null });
    }

    // 2. Fetch all alumni_contacts grouped by chapter_id
    // We pull raw rows because Supabase JS doesn't support GROUP BY with counts in one call easily.
    // Use a reasonable cap — production chapters shouldn't exceed 50k contacts total.
    const { data: contacts, error: contactsError } = await supabase
      .from('alumni_contacts')
      .select('chapter_id, outreach_status, touch1_sent_at, last_response_at')
      .limit(100000);

    if (contactsError) {
      return NextResponse.json(
        { data: null, error: { message: contactsError.message, code: 'DB_ERROR' } },
        { status: 500 },
      );
    }

    const LINKED_STATUSES = new Set(['pitched', 'touch2_sent', 'touch3_sent']);

    // 3. Build a map: chapter_id → stats
    type Stats = { total: number; sent: number; replied: number; linked: number; signed_up: number };
    const statsMap: Record<string, Stats> = {};

    for (const row of (contacts ?? [])) {
      const cid = row.chapter_id as string;
      if (!cid) continue;

      if (!statsMap[cid]) {
        statsMap[cid] = { total: 0, sent: 0, replied: 0, linked: 0, signed_up: 0 };
      }

      const s = statsMap[cid];
      s.total += 1;
      if (row.touch1_sent_at) s.sent += 1;
      if (row.last_response_at) s.replied += 1;
      if (LINKED_STATUSES.has(row.outreach_status ?? '')) s.linked += 1;
      if (row.outreach_status === 'signed_up') s.signed_up += 1;
    }

    // 4. Merge chapters with stats
    const result = (chapters as { id: string; chapter_name: string; fraternity: string | null; school: string | null }[]).map(ch => {
      const s: Stats = statsMap[ch.id] ?? { total: 0, sent: 0, replied: 0, linked: 0, signed_up: 0 };

      let status: 'not_started' | 'active' | 'done' = 'not_started';
      if (s.total > 0 && s.signed_up >= s.total) {
        status = 'done';
      } else if (s.sent > 0) {
        status = 'active';
      }

      return {
        chapter_id: ch.id,
        chapter_name: ch.chapter_name,
        fraternity: ch.fraternity,
        school: ch.school,
        ...s,
        status,
      };
    });

    return NextResponse.json({ data: result, error: null });
  } catch (err) {
    console.error('[GET /api/outreach/pipeline-summary] Error:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 },
    );
  }
}
