import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  const { id } = await params;

  const { data, error } = await admin
    .from('pipeline_deals')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  // Shape for backward compatibility
  const shaped = {
    ...data,
    organization: {
      name: data.deal_name || '',
      school: { name: data.university || '' },
      national_org: { name: data.national_org || '' },
    },
    contact: data.contact_name ? {
      name: data.contact_name,
      email: data.contact_email,
      phone: data.contact_phone,
    } : null,
  };

  return NextResponse.json(shaped);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  const { id } = await params;
  const payload = await req.json();

  const { data, error } = await admin.from('pipeline_deals').update(payload).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  const { id } = await params;

  const { error } = await admin.from('pipeline_deals').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
