import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function getSupabaseAdmin() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } }, { status: 500 });

    const { milestoneId } = await params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {};
    for (const field of ['name', 'description', 'target_date', 'status', 'sort_order']) {
      if (body[field] !== undefined) updateData[field] = body[field];
    }

    const { data, error } = await supabase.from('milestones').update(updateData).eq('id', milestoneId).select('*').single();

    if (error) return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; milestoneId: string }> }
) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } }, { status: 500 });

    const { milestoneId } = await params;
    const { error } = await supabase.from('milestones').delete().eq('id', milestoneId);

    if (error) return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    return NextResponse.json({ data: { success: true }, error: null });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}
