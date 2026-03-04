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

  const conference = req.nextUrl.searchParams.get('conference');
  const search = req.nextUrl.searchParams.get('search');

  let query = admin.from('schools').select(`
    *,
    organizations(id, name, type, status, national_org_id,
      pipeline_deals(id, stage, value)
    )
  `).order('name');

  if (conference) query = query.eq('conference', conference);
  if (search) query = query.ilike('name', `%${search}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const body = await req.json();
  const { data, error } = await admin.from('schools').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
