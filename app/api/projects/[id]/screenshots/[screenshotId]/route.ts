import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

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
