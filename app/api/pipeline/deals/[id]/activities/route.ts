// GET: list activities for a deal
// POST: create new activity
// Next.js 15: params is a Promise — await it
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json([], { status: 200 });
  const { data } = await admin
    .from('deal_activities')
    .select('*')
    .eq('deal_id', id)
    .order('created_at', { ascending: false });
  return NextResponse.json(data || []);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  const body = await req.json();
  const { data, error } = await admin
    .from('deal_activities')
    .insert({ ...body, deal_id: id })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
