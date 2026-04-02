import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: chapterId } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const { data, error } = await supabase
    .from('chapter_matches')
    .select('*')
    .eq('chapter_id', chapterId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: chapterId } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const body = await req.json();
  const { active_member, alumni_name, date, notes } = body;

  if (!active_member?.trim() || !alumni_name?.trim()) {
    return NextResponse.json({ error: 'active_member and alumni_name are required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('chapter_matches')
    .insert({
      chapter_id: chapterId,
      active_member: active_member.trim(),
      alumni_name: alumni_name.trim(),
      date: date || new Date().toISOString().split('T')[0],
      notes: notes || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: chapterId } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const matchId = searchParams.get('matchId');
  if (!matchId) return NextResponse.json({ error: 'matchId required' }, { status: 400 });

  const { error } = await supabase
    .from('chapter_matches')
    .delete()
    .eq('id', matchId)
    .eq('chapter_id', chapterId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
