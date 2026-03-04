import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function getSupabaseAdmin() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; screenshotId: string }> }) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ data: null, error: { message: 'DB not configured' } }, { status: 500 });
    const { screenshotId } = await params;
    const { error } = await supabase.from('project_screenshots').delete().eq('id', screenshotId);
    if (error) return NextResponse.json({ data: null, error: { message: error.message } }, { status: 500 });
    return NextResponse.json({ data: { success: true }, error: null });
  } catch { return NextResponse.json({ data: null, error: { message: 'Internal error' } }, { status: 500 }); }
}
