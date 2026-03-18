import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const AUTH_TOKEN = 'hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h';

function checkAuth(request: NextRequest): boolean {
  const auth = request.headers.get('Authorization');
  return auth === `Bearer ${AUTH_TOKEN}`;
}

/** GET /api/headhunting/connections?chapter_id=<uuid> */
export async function GET(request: NextRequest) {
  if (!checkAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const chapter_id = request.nextUrl.searchParams.get('chapter_id');
  if (!chapter_id) return NextResponse.json({ error: 'chapter_id required' }, { status: 400 });

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const { data, error } = await db
    .from('member_connections')
    .select(`
      id, chapter_id, member_a_id, member_b_id, status, notes, created_at,
      member_a:chapter_members!member_a_id(id, name, member_type),
      member_b:chapter_members!member_b_id(id, name, member_type)
    `)
    .eq('chapter_id', chapter_id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

/** POST /api/headhunting/connections */
export async function POST(request: NextRequest) {
  if (!checkAuth(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { chapter_id, member_a_id, member_b_id, status, notes } = body;

  if (!chapter_id || !member_a_id || !member_b_id) {
    return NextResponse.json({ error: 'chapter_id, member_a_id, member_b_id required' }, { status: 400 });
  }
  if (member_a_id === member_b_id) {
    return NextResponse.json({ error: 'Cannot connect a member to themselves' }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const { data, error } = await db
    .from('member_connections')
    .insert([{
      chapter_id,
      member_a_id,
      member_b_id,
      status: status || 'intro_made',
      notes: notes || null,
    }])
    .select(`
      id, chapter_id, member_a_id, member_b_id, status, notes, created_at,
      member_a:chapter_members!member_a_id(id, name, member_type),
      member_b:chapter_members!member_b_id(id, name, member_type)
    `)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
