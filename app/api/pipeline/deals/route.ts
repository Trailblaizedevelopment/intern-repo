import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const url = req.nextUrl;
  const stage = url.searchParams.get('stage');
  const assigned_to = url.searchParams.get('assigned_to');
  const deal_type = url.searchParams.get('deal_type');
  const temperature = url.searchParams.get('temperature');
  const conference = url.searchParams.get('conference');
  const search = url.searchParams.get('search');
  const overdue = url.searchParams.get('overdue');
  const category = url.searchParams.get('category');
  const limitParam = parseInt(url.searchParams.get('limit') ?? '500');
  const safeLimit = Math.min(Math.max(limitParam, 1), 500);

  // Flat query — no joins needed. Deal owns its own data.
  let query = admin
    .from('pipeline_deals')
    .select('*')
    .order('next_followup', { ascending: true, nullsFirst: false })
    .limit(safeLimit);

  if (stage && stage !== 'all') query = query.eq('stage', stage);
  if (assigned_to) query = query.eq('assigned_to', assigned_to);
  if (deal_type) query = query.eq('deal_type', deal_type);
  if (temperature) query = query.eq('temperature', temperature);
  if (conference) query = query.eq('conference', conference);
  if (category && category !== 'all') query = query.eq('category', category);
  if (overdue === 'true') {
    query = query.lt('next_followup', new Date().toISOString().split('T')[0]);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let results = data || [];

  // Search across flat fields — no joins needed
  if (search) {
    const s = search.toLowerCase();
    results = results.filter(d =>
      d.deal_name?.toLowerCase().includes(s) ||
      d.university?.toLowerCase().includes(s) ||
      d.contact_name?.toLowerCase().includes(s) ||
      d.national_org?.toLowerCase().includes(s) ||
      d.rep_name?.toLowerCase().includes(s) ||
      d.notes?.toLowerCase().includes(s) ||
      d.conference?.toLowerCase().includes(s)
    );
  }

  // Shape response to match what the CRM expects
  // (backward compatible — nest flat fields into the old structure)
  const shaped = results.map(d => ({
    ...d,
    organization: {
      name: d.deal_name || '',
      school: { name: d.university || '' },
      national_org: { name: d.national_org || '' },
    },
    contact: d.contact_name ? {
      name: d.contact_name,
      email: d.contact_email,
      phone: d.contact_phone,
    } : null,
  }));

  return NextResponse.json(shaped);
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const body = await req.json();

  // Validation
  if (!body.deal_name) {
    return NextResponse.json({ error: 'deal_name is required.' }, { status: 400 });
  }
  if (!body.stage) {
    return NextResponse.json({ error: 'stage is required.' }, { status: 400 });
  }
  if (body.stage === 'closed_won' && (!body.value || body.value <= 0)) {
    return NextResponse.json({ error: 'Closed Won deals must have a value > $0.' }, { status: 400 });
  }

  const { data, error } = await admin.from('pipeline_deals').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
