import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
function getAdmin() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function GET(req: NextRequest) {
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const search = req.nextUrl.searchParams.get('search');
  const org_id = req.nextUrl.searchParams.get('org_id');

  let query = admin.from('contacts').select(`
    *,
    organization:organizations(id, name, school:schools(id, name))
  `).order('name');

  if (org_id) query = query.eq('org_id', org_id);
  if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const body = await req.json();
  const { data, error } = await admin.from('contacts').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
