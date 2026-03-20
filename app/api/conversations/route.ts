/**
 * GET /api/conversations
 * List linq_conversations with filtering, search, and pagination.
 *
 * Query params:
 *   status  — active | handled | flagged | all (default: active)
 *   line    — phone number or "all" (default: all)
 *   search  — name/phone/chapter text search
 *   page    — 1-indexed (default: 1)
 *   limit   — per page (default: 50)
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
  const status = searchParams.get('status') || 'active';
  const line = searchParams.get('line') || 'all';
  const search = (searchParams.get('search') || '').trim();
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')));
  const offset = (page - 1) * limit;

  try {
    let query = supabase
      .from('linq_conversations')
      .select('*', { count: 'exact' });

    // Status filter
    if (status !== 'all') {
      query = query.eq('status', status);
    }

    // Line filter
    if (line && line !== 'all') {
      query = query.eq('line_phone', line);
    }

    // Search filter (ilike on contact_name, contact_phone, chapter_name)
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

    return NextResponse.json({ data: data || [], total: count ?? 0 });
  } catch (err) {
    console.error('[conversations GET]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
