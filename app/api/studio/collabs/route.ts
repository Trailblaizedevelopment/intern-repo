import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

function toFrontend(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    chapterName: (row.chapter_name as string) || '',
    school: (row.school as string) || '',
    status: (row.status as string) || 'Not Started',
    postDate: (row.post_date as string) || '',
    igLink: (row.ig_link as string) || '',
    likes: (row.likes as number) || 0,
    comments: (row.comments as number) || 0,
    notes: (row.notes as string) || '',
  };
}

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const { data, error } = await supabase
    .from('studio_collabs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data || []).map(toFrontend));
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const body = await req.json();
  const row = {
    chapter_name: body.chapterName,
    school: body.school || null,
    status: body.status || 'Not Started',
    post_date: body.postDate || null,
    ig_link: body.igLink || null,
    likes: body.likes || 0,
    comments: body.comments || 0,
    notes: body.notes || null,
  };

  const { data, error } = await supabase.from('studio_collabs').insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(toFrontend(data));
}

export async function PATCH(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const body = await req.json();
  const { id, ...rest } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data, error } = await supabase
    .from('studio_collabs')
    .update({
      chapter_name: rest.chapterName,
      school: rest.school || null,
      status: rest.status,
      post_date: rest.postDate || null,
      ig_link: rest.igLink || null,
      likes: rest.likes || 0,
      comments: rest.comments || 0,
      notes: rest.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(toFrontend(data));
}

export async function DELETE(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase.from('studio_collabs').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
