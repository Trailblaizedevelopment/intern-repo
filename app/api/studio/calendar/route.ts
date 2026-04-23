import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

function toFrontend(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    date: row.date as string,
    title: row.title as string,
    platform: row.platform as string,
    status: row.status as string,
    link: (row.link as string) || '',
    notes: (row.notes as string) || '',
  };
}

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  // Optional month filter: YYYY-MM
  const month = req.nextUrl.searchParams.get('month');
  let query = supabase.from('studio_calendar').select('*').order('date', { ascending: true });

  if (month) {
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    query = query
      .gte('date', `${month}-01`)
      .lte('date', `${month}-${String(lastDay).padStart(2, '0')}`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data || []).map(toFrontend));
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const body = await req.json();
  const row = {
    date: body.date,
    title: body.title,
    platform: body.platform,
    status: body.status,
    link: body.link || null,
    notes: body.notes || null,
  };

  const { data, error } = await supabase.from('studio_calendar').insert(row).select().single();
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
    .from('studio_calendar')
    .update({
      date: rest.date,
      title: rest.title,
      platform: rest.platform,
      status: rest.status,
      link: rest.link || null,
      notes: rest.notes || null,
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

  const { error } = await supabase.from('studio_calendar').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
