import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const body = await req.json();

  // Only allow updating these fields
  const allowed: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body.status !== undefined)         allowed.status         = body.status;
  if (body.next_step !== undefined)      allowed.next_step      = body.next_step;
  if (body.owner !== undefined)          allowed.owner          = body.owner;
  if (body.pipeline_value !== undefined) allowed.pipeline_value = body.pipeline_value;
  if (body.last_contact !== undefined)   allowed.last_contact   = body.last_contact;
  if (body.contact_name !== undefined)   allowed.contact_name   = body.contact_name;
  if (body.notes !== undefined)          allowed.notes          = body.notes;

  const { data, error } = await admin
    .from('sales_leads')
    .update(allowed)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
