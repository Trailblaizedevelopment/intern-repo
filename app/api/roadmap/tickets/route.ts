// POST: create a new ticket
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const body = await req.json() as {
    title: string;
    project?: string;
    project_id?: string;
    priority?: string;
    sprint?: string;
    status?: string;
  };

  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  // Get next ticket number
  const { data: maxRow } = await admin
    .from('tickets')
    .select('number')
    .order('number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextNumber = (maxRow?.number ?? 0) + 1;

  const { data, error } = await admin
    .from('tickets')
    .insert({
      number: nextNumber,
      title: body.title.trim(),
      project: body.project ?? null,
      project_id: body.project_id ?? null,
      priority: body.priority ?? null,
      sprint: body.sprint ?? null,
      status: body.status ?? 'open',
      type: 'feature_request',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
