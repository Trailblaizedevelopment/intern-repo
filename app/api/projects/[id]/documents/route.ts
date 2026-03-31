import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } }, { status: 500 });

    const { id } = await params;
    const { data, error } = await supabase
      .from('project_documents')
      .select('*, author:employees!project_documents_created_by_fkey(id, name)')
      .eq('project_id', id)
      .order('updated_at', { ascending: false });

    if (error) return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } }, { status: 500 });

    const { id } = await params;
    const body = await request.json();

    if (!body.title) return NextResponse.json({ data: null, error: { message: 'Title is required', code: 'VALIDATION_ERROR' } }, { status: 400 });

    const { data, error } = await supabase
      .from('project_documents')
      .insert([{
        project_id: id,
        title: body.title,
        content: body.content || null,
        created_by: body.created_by || null,
      }])
      .select('*')
      .single();

    if (error) return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}
