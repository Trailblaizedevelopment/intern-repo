/**
 * GET /api/conversations
 * List linq_conversations with filtering and pagination.
 *
 * Query params:
 *   mode        — chapters_summary (returns chapter breakdown) | (default: list)
 *   status      — active | flagged | unresponsive | handled | all (default: active)
 *   chapter_id  — filter by chapter UUID
 *   search      — name/phone/chapter text search
 *   page        — 1-indexed (default: 1)
 *   limit       — per page (default: 50)
 *
 * chapters_summary response:
 *   { chapters: [{ chapter_id, chapter_name, count }] } sorted by count DESC
 *
 * All requests require: Authorization: Bearer <internal_token>
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const INTERNAL_TOKEN = 'hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h';

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('Authorization') || '';
  return auth === `Bearer ${INTERNAL_TOKEN}`;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('mode') || '';
  const status = searchParams.get('status') || 'active';
  const chapterId = (searchParams.get('chapter_id') || '').trim();
  const search = (searchParams.get('search') || '').trim();
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')));
  const offset = (page - 1) * limit;
  const category = (searchParams.get('category') || '').trim();

  try {
    // ── category_counts mode ───────────────────────────────────────────────
    if (mode === 'category_counts') {
      if (!chapterId) {
        return NextResponse.json({ error: 'chapter_id required for category_counts' }, { status: 400 });
      }

      type CountRow = { status: string; touch_stage: string | null; outreach_status: string | null; has_unread_reply: boolean };

      const { data: allRows, error: allErr } = await supabase
        .from('linq_conversations')
        .select('status, touch_stage, outreach_status, has_unread_reply')
        .eq('chapter_id', chapterId);

      if (allErr) return NextResponse.json({ error: allErr.message }, { status: 500 });

      const rows: CountRow[] = allRows || [];
      const counts = {
        needs_reply:  rows.filter(r => r.has_unread_reply).length,
        flagged:      rows.filter(r => r.status === 'flagged').length,
        touch1:       rows.filter(r => r.touch_stage === 'T1' && r.status === 'active').length,
        touch2:       rows.filter(r => r.touch_stage === 'T2' && r.status === 'active').length,
        touch3:       rows.filter(r => r.touch_stage === 'T3' && r.status === 'active').length,
        signed_up:    rows.filter(r => r.outreach_status === 'signed_up').length,
        confirmed:    rows.filter(r => r.outreach_status === 'touch1_confirmed').length,
        no_response:  rows.filter(r => r.outreach_status === 'no_response').length,
        handled:      rows.filter(r => r.status === 'handled').length,
        all:          rows.length,
      };

      return NextResponse.json({ counts });
    }

    // ── chapters_summary mode ──────────────────────────────────────────────
    if (mode === 'chapters_summary') {
      let q = supabase
        .from('linq_conversations')
        .select('chapter_id, chapter_name, has_unread_reply');

      if (category === 'needs_reply') {
        q = q.eq('has_unread_reply', true);
      } else if (status !== 'all') {
        q = q.eq('status', status);
      }

      const { data, error } = await q;
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Group by chapter_id in JS
      const map = new Map<string, { chapter_id: string | null; chapter_name: string | null; count: number }>();
      for (const row of (data || [])) {
        const key = row.chapter_id ?? '__none__';
        const existing = map.get(key);
        if (!existing) {
          map.set(key, { chapter_id: row.chapter_id, chapter_name: row.chapter_name, count: 1 });
        } else {
          existing.count++;
        }
      }

      const chapters = [...map.values()].sort((a, b) => b.count - a.count);
      return NextResponse.json({ chapters });
    }

    // ── Normal list mode ───────────────────────────────────────────────────
    let query = supabase
      .from('linq_conversations')
      .select('*', { count: 'exact' });

    // Category filter (takes precedence over status when set)
    if (category && category !== 'all') {
      switch (category) {
        case 'needs_reply':
          query = query.eq('has_unread_reply', true);
          break;
        case 'flagged':
          query = query.eq('status', 'flagged');
          break;
        case 'touch1':
          query = query.eq('touch_stage', 'T1').eq('status', 'active');
          break;
        case 'touch2':
          query = query.eq('touch_stage', 'T2').eq('status', 'active');
          break;
        case 'touch3':
          query = query.eq('touch_stage', 'T3').eq('status', 'active');
          break;
        case 'signed_up':
          query = query.eq('outreach_status', 'signed_up');
          break;
        case 'confirmed':
          query = query.eq('outreach_status', 'touch1_confirmed');
          break;
        case 'no_response':
          query = query.eq('outreach_status', 'no_response');
          break;
        case 'handled':
          query = query.eq('status', 'handled');
          break;
      }
    } else if (!category || category === 'all') {
      // Status filter (only when category not set)
      if (status !== 'all') {
        query = query.eq('status', status);
      }
    }

    // Chapter filter
    if (chapterId) {
      query = query.eq('chapter_id', chapterId);
    }

    // Search filter
    if (search) {
      query = query.or(
        `contact_name.ilike.%${search}%,contact_phone.ilike.%${search}%,chapter_name.ilike.%${search}%`
      );
    }

    // Sort: unread first, then most recent
    query = query
      .order('has_unread_reply', { ascending: false })
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ── Enrich contact_name from alumni_contacts ───────────────────────────
    const rows = data || [];
    const nullNameIds = rows
      .filter(r => !r.contact_name && r.linq_chat_id)
      .map(r => r.linq_chat_id as string);

    if (nullNameIds.length > 0) {
      const { data: contacts } = await supabase
        .from('alumni_contacts')
        .select('linq_chat_id, first_name, last_name')
        .in('linq_chat_id', nullNameIds);

      if (contacts && contacts.length > 0) {
        const nameMap = new Map<string, string>();
        for (const c of contacts) {
          if (c.linq_chat_id) {
            const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
            if (name) nameMap.set(c.linq_chat_id, name);
          }
        }
        for (const row of rows) {
          if (!row.contact_name && row.linq_chat_id) {
            const resolved = nameMap.get(row.linq_chat_id);
            if (resolved) row.contact_name = resolved;
          }
        }
      }
    }

    return NextResponse.json({ data: rows, total: count ?? 0 });
  } catch (err) {
    console.error('[conversations GET]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
