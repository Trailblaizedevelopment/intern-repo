import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl        = process.env.NEXT_PUBLIC_SUPABASE_URL       || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY      || '';

function getAdmin() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function GET(request: NextRequest) {
  const chapter_id = request.nextUrl.searchParams.get('chapter_id');
  if (!chapter_id) return NextResponse.json({ error: 'chapter_id required' }, { status: 400 });

  const db = getAdmin();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const { data, error } = await db
    .from('chapter_members')
    .select('*')
    .eq('chapter_id', chapter_id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const db = getAdmin();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const { data, error } = await db
    .from('chapter_members')
    .insert([body])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const db = getAdmin();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const { data, error } = await db
    .from('chapter_members')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const db = getAdmin();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const { error } = await db.from('chapter_members').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
