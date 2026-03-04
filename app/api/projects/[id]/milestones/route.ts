import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function getSupabaseAdmin() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } }, { status: 500 });

    const { id } = await params;
    const { data, error } = await supabase.from('milestones').select('*').eq('project_id', id).order('sort_order');

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

    if (!body.name) return NextResponse.json({ data: null, error: { message: 'Name is required', code: 'VALIDATION_ERROR' } }, { status: 400 });

    const { data, error } = await supabase
      .from('milestones')
      .insert([{
        project_id: id,
        name: body.name,
        description: body.description || null,
        target_date: body.target_date || null,
        status: body.status || 'open',
        sort_order: body.sort_order || 0,
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
