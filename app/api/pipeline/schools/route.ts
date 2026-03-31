import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const conference = req.nextUrl.searchParams.get('conference');
  const search = req.nextUrl.searchParams.get('search');

  // Step 1: Get all deals with their org_id (exclude dead stages)
  const { data: deals, error: dealsError } = await admin
    .from('pipeline_deals')
    .select('id, stage, value, org_id')
    .not('stage', 'in', '("closed_lost","hold_off")');

  if (dealsError) return NextResponse.json({ error: dealsError.message }, { status: 500 });

  // Build a map of org_id → deals
  const dealsByOrg = new Map<string, { id: string; stage: string; value: number }[]>();
  for (const d of deals || []) {
    if (!d.org_id) continue;
    if (!dealsByOrg.has(d.org_id)) dealsByOrg.set(d.org_id, []);
    dealsByOrg.get(d.org_id)!.push({ id: d.id, stage: d.stage, value: d.value });
  }

  // Only org_ids that have at least one active deal
  const activeOrgIds = [...dealsByOrg.keys()];
  if (activeOrgIds.length === 0) return NextResponse.json([]);

  // Step 2: Get orgs that have active deals, with their school
  const { data: orgs, error: orgsError } = await admin
    .from('organizations')
    .select('id, name, type, status, school_id, schools(id, name, conference)')
    .in('id', activeOrgIds);

  if (orgsError) return NextResponse.json({ error: orgsError.message }, { status: 500 });

  // Step 3: Group orgs by school
  const schoolMap = new Map<string, { id: string; name: string; conference: string | null; organizations: any[] }>();

  for (const org of orgs || []) {
    const school = (org as any).schools;
    if (!school) continue;

    if (!schoolMap.has(school.id)) {
      schoolMap.set(school.id, {
        id: school.id,
        name: school.name,
        conference: school.conference,
        organizations: [],
      });
    }

    schoolMap.get(school.id)!.organizations.push({
      id: org.id,
      name: org.name,
      type: org.type,
      status: org.status,
      pipeline_deals: dealsByOrg.get(org.id) || [],
    });
  }

  let result = [...schoolMap.values()].sort((a, b) => a.name.localeCompare(b.name));

  if (conference) result = result.filter(s => s.conference === conference);
  if (search) result = result.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const body = await req.json();
  const { data, error } = await admin.from('schools').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
