import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
function getAdmin() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  const { id } = await params;

  const { data, error } = await admin
    .from('national_orgs')
    .select(`
      *,
      organizations(*, school:schools(*),
        pipeline_deals(*, contact:contacts(*))
      ),
      contacts(*)
    `)
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  const { id } = await params;
  const body = await req.json();

  const { data, error } = await admin.from('national_orgs').update(body).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
