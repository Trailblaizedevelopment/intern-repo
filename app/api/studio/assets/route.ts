import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Map DB row → frontend shape
function toFrontend(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    name: row.name as string,
    category: row.category as string,
    // Prefer file_url (uploaded file) over url (external link)
    url: (row.file_url as string) || (row.url as string) || '',
    fileUrl: (row.file_url as string) || null,
    fileType: (row.file_type as string) || null,
    addedBy: (row.added_by as string) || '',
    addedAt: row.created_at ? (row.created_at as string).slice(0, 10) : '',
    notes: (row.notes as string) || '',
  };
}

// Parse data URL → { fileUrl, fileType, mimeType }
function parseDataUrl(url: string): { fileUrl: string; fileType: string } | null {
  if (!url?.startsWith('data:')) return null;
  const m = url.match(/^data:([^;]+);/);
  return { fileUrl: url, fileType: m?.[1] || '' };
}

export async function GET(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const category = req.nextUrl.searchParams.get('category');
  let query = supabase.from('studio_assets').select('*').order('created_at', { ascending: false });
  if (category) query = query.eq('category', category);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data || []).map(toFrontend));
}

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const body = await req.json();
  const dataUrl = parseDataUrl(body.url);

  const row = {
    name: body.name,
    category: body.category,
    url: dataUrl ? '' : (body.url || ''),
    file_url: dataUrl?.fileUrl ?? null,
    file_type: dataUrl?.fileType ?? null,
    added_by: body.addedBy || '',
    notes: body.notes || null,
  };

  const { data, error } = await supabase.from('studio_assets').insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(toFrontend(data));
}

export async function PATCH(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const body = await req.json();
  const { id, ...rest } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const dataUrl = parseDataUrl(rest.url);

  const updates: Record<string, unknown> = {
    name: rest.name,
    category: rest.category,
    url: dataUrl ? '' : (rest.url || ''),
    file_url: dataUrl?.fileUrl ?? null,
    file_type: dataUrl?.fileType ?? null,
    added_by: rest.addedBy || '',
    notes: rest.notes || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('studio_assets').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(toFrontend(data));
}

export async function DELETE(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase.from('studio_assets').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
