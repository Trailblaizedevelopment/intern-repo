import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ data: null, error: { message: 'DB not configured' } }, { status: 500 });
    const { id } = await params;
    const { data, error } = await supabase
      .from('project_comments')
      .select('*, author:employees!project_comments_author_id_fkey(id, name)')
      .eq('project_id', id)
      .order('created_at', { ascending: true });
    if (error) return NextResponse.json({ data: null, error: { message: error.message } }, { status: 500 });
    return NextResponse.json({ data, error: null });
  } catch { return NextResponse.json({ data: null, error: { message: 'Internal error' } }, { status: 500 }); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ data: null, error: { message: 'DB not configured' } }, { status: 500 });
    const { id } = await params;
    const body = await request.json();
    if (!body.content?.trim()) return NextResponse.json({ data: null, error: { message: 'Content required' } }, { status: 400 });
    const { data, error } = await supabase
      .from('project_comments')
      .insert([{ project_id: id, author_id: body.author_id || null, content: body.content.trim() }])
      .select('*, author:employees!project_comments_author_id_fkey(id, name)')
      .single();
    if (error) return NextResponse.json({ data: null, error: { message: error.message } }, { status: 500 });
    return NextResponse.json({ data, error: null });
  } catch { return NextResponse.json({ data: null, error: { message: 'Internal error' } }, { status: 500 }); }
}
