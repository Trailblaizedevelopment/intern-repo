import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

function toFrontend(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    name: row.name as string,
    startDate: (row.start_date as string) || '',
    endDate: (row.end_date as string) || '',
    platforms: (row.platforms as string[]) || [],
    plannedPieces: (row.planned as number) || 0,
    publishedPieces: (row.published as number) || 0,
    status: (row.status as string) || 'Planning',
    notes: (row.notes as string) || '',
  };
}

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const { data, error } = await supabase
    .from('studio_campaigns')
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
    name: body.name,
    start_date: body.startDate || null,
    end_date: body.endDate || null,
    platforms: body.platforms || [],
    planned: body.plannedPieces || 0,
    published: body.publishedPieces || 0,
    status: body.status || 'Planning',
    notes: body.notes || null,
  };

  const { data, error } = await supabase.from('studio_campaigns').insert(row).select().single();
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
    .from('studio_campaigns')
    .update({
      name: rest.name,
      start_date: rest.startDate || null,
      end_date: rest.endDate || null,
      platforms: rest.platforms || [],
      planned: rest.plannedPieces || 0,
      published: rest.publishedPieces || 0,
      status: rest.status,
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

  const { error } = await supabase.from('studio_campaigns').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
