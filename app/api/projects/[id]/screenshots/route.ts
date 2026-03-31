import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ data: null, error: { message: 'DB not configured' } }, { status: 500 });
    const { id } = await params;
    const { data, error } = await supabase
      .from('project_screenshots')
      .select('*, creator:employees!project_screenshots_created_by_fkey(id, name)')
      .eq('project_id', id)
      .order('created_at', { ascending: false });
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
    const { data, error } = await supabase
      .from('project_screenshots')
      .insert([{ project_id: id, url: body.url, caption: body.caption || null, created_by: body.created_by || null }])
      .select()
      .single();
    if (error) return NextResponse.json({ data: null, error: { message: error.message } }, { status: 500 });
    return NextResponse.json({ data, error: null });
  } catch { return NextResponse.json({ data: null, error: { message: 'Internal error' } }, { status: 500 }); }
}
