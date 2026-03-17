import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const AUTH_TOKEN = 'hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h';

const LINE_LABELS: Record<number, string> = { 1: 'Owen', 2: 'Adam', 3: 'Ford' };

/**
 * GET /api/outreach/conversations/list
 *
 * DB-first conversation list. No Linq API calls — purely reads alumni_contacts.
 * Two modes:
 *   mode=active      → last_response_at IS NOT NULL
 *   mode=unanswered  → last_response_at IS NULL AND touch1_sent_at IS NOT NULL
 *
 * Supports: search, chapter_id, line (1|2|3), page (1-indexed), limit (default 50)
 */

function getTouchStage(c: { touch3_sent_at: string | null; touch2_sent_at: string | null; touch1_sent_at: string | null }): string {
  if (c.touch3_sent_at) return 'T3';
  if (c.touch2_sent_at) return 'T2';
  if (c.touch1_sent_at) return 'T1';
  return 'T0';
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== AUTH_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('mode') || 'active'; // 'active' | 'unanswered'
  const search = searchParams.get('search') || '';
  const chapterId = searchParams.get('chapter_id') || '';
  const lineFilter = searchParams.get('line') ? parseInt(searchParams.get('line')!) : null;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(100, parseInt(searchParams.get('limit') || '50'));
  const offset = (page - 1) * limit;

  // ── Build query ────────────────────────────────────────────────────────────
  let query = supabase
    .from('alumni_contacts')
    .select(`
      id,
      first_name,
      last_name,
      phone_primary,
      outreach_status,
      assigned_line,
      linq_chat_id,
      chapter_id,
      year,
      touch1_sent_at,
      touch2_sent_at,
      touch3_sent_at,
      last_response_at,
      response_text,
      flagged,
      flagged_reason,
      handled_at
    `, { count: 'exact' });

  // ── Status filters ─────────────────────────────────────────────────────────
  if (mode === 'active') {
    query = query.not('last_response_at', 'is', null);
  } else {
    query = query.is('last_response_at', null).not('touch1_sent_at', 'is', null);
  }

  if (chapterId) query = query.eq('chapter_id', chapterId);
  if (lineFilter) query = query.eq('assigned_line', lineFilter);

  // Apply pagination + sort
  if (mode === 'active') {
    query = query.order('last_response_at', { ascending: false });
  } else {
    query = query.order('touch1_sent_at', { ascending: true });
  }

  query = query.range(offset, offset + limit - 1);

  const { data: contacts, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!contacts?.length) {
    return NextResponse.json({ data: [], total: 0, page, limit });
  }

  // ── Enrich with chapter names ──────────────────────────────────────────────
  const chapterIds = [...new Set(contacts.map(c => c.chapter_id).filter(Boolean))];
  const chapterMap = new Map<string, string>();
  if (chapterIds.length > 0) {
    const { data: chapters } = await supabase
      .from('chapters')
      .select('id, chapter_name')
      .in('id', chapterIds);
    for (const ch of chapters || []) chapterMap.set(ch.id, ch.chapter_name);
  }

  const now = Date.now();
  const fortyEightHoursMs = 48 * 60 * 60 * 1000;

  // ── Apply search filter (post-join, in-memory for now) ─────────────────────
  let results = contacts.map(c => ({
    id: c.id,
    first_name: c.first_name,
    last_name: c.last_name,
    contact_name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown',
    phone_primary: c.phone_primary,
    outreach_status: c.outreach_status,
    assigned_line: c.assigned_line as number | null,
    line_label: c.assigned_line ? (LINE_LABELS[c.assigned_line as number] || null) : null,
    linq_chat_id: c.linq_chat_id,
    chapter_id: c.chapter_id,
    chapter_name: c.chapter_id ? (chapterMap.get(c.chapter_id) || 'Unknown') : 'Unknown',
    grad_year: c.year,
    touch1_sent_at: c.touch1_sent_at,
    touch2_sent_at: c.touch2_sent_at,
    touch3_sent_at: c.touch3_sent_at,
    last_response_at: c.last_response_at,
    last_response_text: c.response_text,
    flagged: c.flagged || false,
    flagged_reason: c.flagged_reason,
    handled_at: c.handled_at,
    touch_stage: getTouchStage(c),
    is_urgent: c.last_response_at
      ? (now - new Date(c.last_response_at).getTime()) > fortyEightHoursMs
      : false,
  }));

  if (search) {
    const q = search.toLowerCase();
    results = results.filter(c =>
      c.contact_name.toLowerCase().includes(q) ||
      (c.phone_primary || '').includes(q) ||
      c.chapter_name.toLowerCase().includes(q)
    );
  }

  return NextResponse.json({
    data: results,
    total: count || 0,
    page,
    limit,
    mode,
  });
}
