// PATCH: update due_date for a ticket
// Next.js 15: params is a Promise
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  const body = await req.json();
  const { due_date } = body;
  if (!due_date) return NextResponse.json({ error: 'due_date required' }, { status: 400 });
  const { data, error } = await admin
    .from('tickets')
    .update({ due_date, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
