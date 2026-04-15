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

  // Step 2: Get orgs that have active deals, with their school (including state)
  const { data: orgs, error: orgsError } = await admin
    .from('organizations')
    .select('id, name, type, status, school_id, schools(id, name, conference, state)')
    .in('id', activeOrgIds);

  if (orgsError) return NextResponse.json({ error: orgsError.message }, { status: 500 });

  // Step 3: Also get active chapters (closed_won deals)
  const { data: activeDeals } = await admin
    .from('pipeline_deals')
    .select('id, org_id, stage, value')
    .eq('stage', 'closed_won');
  const activeOrgIdSet = new Set((activeDeals || []).map((d: any) => d.org_id));

  // Step 4: Group orgs by school, build rich response
  const schoolMap = new Map<string, {
    id: string; name: string; conference: string | null; state: string | null;
    fraternities: any[]; sororities: any[];
    activeChapters: any[]; pipelineValue: number; dealCount: number;
  }>();

  for (const org of orgs || []) {
    const school = (org as any).schools;
    if (!school) continue;

    if (!schoolMap.has(school.id)) {
      schoolMap.set(school.id, {
        id: school.id,
        name: school.name,
        conference: school.conference ?? null,
        state: school.state ?? null,
        fraternities: [],
        sororities: [],
        activeChapters: [],
        pipelineValue: 0,
        dealCount: 0,
      });
    }

    const entry = schoolMap.get(school.id)!;
    const orgDeals = dealsByOrg.get(org.id) || [];
    const orgEntry = {
      id: org.id,
      name: org.name,
      deals: orgDeals.map(d => ({ id: d.id, stage: d.stage, value: d.value, assigned_to: (d as any).assigned_to ?? null })),
    };

    // Split into fraternities/sororities by type field
    const orgType = (org.type ?? '').toLowerCase();
    if (orgType === 'sorority' || orgType === 'panhellenic') {
      entry.sororities.push(orgEntry);
    } else {
      entry.fraternities.push(orgEntry);
    }

    // Active chapters = orgs with a closed_won deal
    if (activeOrgIdSet.has(org.id)) {
      entry.activeChapters.push({ id: org.id, chapter_name: org.name, mrr: 0 });
    }

    // Pipeline value + deal count
    for (const d of orgDeals) {
      entry.pipelineValue += d.value ?? 0;
      entry.dealCount++;
    }
  }

  // Compute status per school
  const enriched = [...schoolMap.values()].map(s => ({
    ...s,
    status: s.activeChapters.length > 0
      ? 'active_client'
      : s.dealCount > 0
        ? 'in_pipeline'
        : 'not_contacted',
  })).sort((a, b) => a.name.localeCompare(b.name));

  let result = enriched;
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
