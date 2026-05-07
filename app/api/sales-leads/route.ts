import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET() {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const { data, error } = await admin
    .from('sales_leads')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const body = await req.json();

  const payload: Record<string, unknown> = {
    org_name:        body.org_name,
    school:          body.school         ?? null,
    contact_name:    body.contact_name   ?? null,
    owner:           body.owner          ?? null,
    status:          body.status         ?? 'Check In',
    pipeline_value:  body.pipeline_value ?? null,
    last_contact:    body.last_contact   ?? null,
    next_step:       body.next_step      ?? null,
    notes:           body.notes          ?? null,
    is_enterprise:   body.is_enterprise  ?? false,
  };

  if (!payload.org_name) {
    return NextResponse.json({ error: 'org_name is required' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('sales_leads')
    .insert(payload)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
