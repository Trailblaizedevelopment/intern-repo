import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET() {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  // 1. All schools
  const { data: schools, error: schoolsError } = await admin
    .from('schools')
    .select('id, name, state, conference')
    .order('name');
  if (schoolsError) return NextResponse.json({ error: schoolsError.message }, { status: 500 });

  // 2. All organizations (frats/sororities) with school_id
  const { data: orgs, error: orgsError } = await admin
    .from('organizations')
    .select('id, name, type, status, school_id');
  if (orgsError) return NextResponse.json({ error: orgsError.message }, { status: 500 });

  // 3. All active pipeline deals (not closed_lost/hold_off) with org info
  const { data: deals, error: dealsError } = await admin
    .from('pipeline_deals')
    .select('id, stage, value, org_id, assigned_to')
    .not('stage', 'in', '("closed_lost","hold_off")');
  if (dealsError) return NextResponse.json({ error: dealsError.message }, { status: 500 });

  // 4. Active chapters (paying clients) - cross-reference by school name
  const { data: chapters, error: chaptersError } = await admin
    .from('chapters')
    .select('id, chapter_name, school, status, mrr')
    .eq('status', 'active');
  if (chaptersError) return NextResponse.json({ error: chaptersError.message }, { status: 500 });

  // Build lookup: org_id → deals[]
  const dealsByOrg = new Map<string, Array<{ id: string; stage: string; value: number; assigned_to: string | null }>>();
  for (const d of deals ?? []) {
    if (!d.org_id) continue;
    if (!dealsByOrg.has(d.org_id)) dealsByOrg.set(d.org_id, []);
    dealsByOrg.get(d.org_id)!.push({ id: d.id, stage: d.stage, value: Number(d.value) || 0, assigned_to: d.assigned_to });
  }

  // Build lookup: school_id → orgs[]
  const orgsBySchool = new Map<string, Array<{ id: string; name: string; type: string; status: string | null; deals: Array<{ id: string; stage: string; value: number; assigned_to: string | null }> }>>();
  for (const org of orgs ?? []) {
    if (!org.school_id) continue;
    if (!orgsBySchool.has(org.school_id)) orgsBySchool.set(org.school_id, []);
    orgsBySchool.get(org.school_id)!.push({
      id: org.id,
      name: org.name,
      type: org.type ?? 'unknown',
      status: org.status,
      deals: dealsByOrg.get(org.id) ?? [],
    });
  }

  // Build lookup: school name (lowercase) → active chapters
  const chaptersBySchool = new Map<string, Array<{ id: string; chapter_name: string; mrr: number }>>();
  for (const ch of chapters ?? []) {
    const key = (ch.school ?? '').trim().toLowerCase();
    if (!key) continue;
    if (!chaptersBySchool.has(key)) chaptersBySchool.set(key, []);
    chaptersBySchool.get(key)!.push({ id: ch.id, chapter_name: ch.chapter_name, mrr: ch.mrr ?? 0 });
  }

  // Assemble school records
  const result = (schools ?? []).map((school) => {
    const schoolOrgs = orgsBySchool.get(school.id) ?? [];
    const fraternities = schoolOrgs.filter((o) => o.type === 'fraternity' || o.type === 'Fraternity');
    const sororities = schoolOrgs.filter((o) => o.type === 'sorority' || o.type === 'Sorority');

    const allDeals = schoolOrgs.flatMap((o) => o.deals);
    const pipelineValue = allDeals.reduce((s, d) => s + d.value, 0);

    const activeChapters = chaptersBySchool.get((school.name ?? '').trim().toLowerCase()) ?? [];

    // Determine status
    let schoolStatus: 'active_client' | 'in_pipeline' | 'not_contacted' = 'not_contacted';
    if (activeChapters.length > 0) schoolStatus = 'active_client';
    else if (allDeals.length > 0) schoolStatus = 'in_pipeline';

    return {
      id: school.id,
      name: school.name,
      state: school.state,
      conference: school.conference,
      fraternities: fraternities.map((f) => ({
        id: f.id,
        name: f.name,
        deals: f.deals,
      })),
      sororities: sororities.map((s) => ({
        id: s.id,
        name: s.name,
        deals: s.deals,
      })),
      activeChapters,
      pipelineValue,
      dealCount: allDeals.length,
      status: schoolStatus,
    };
  });

  // KPI summary
  const totalActiveChapters = [...chaptersBySchool.values()].reduce((s, c) => s + c.length, 0);
  const schoolsWithActiveClient = result.filter((s) => s.status === 'active_client').length;
  const schoolsInPipeline = result.filter((s) => s.status === 'in_pipeline').length;
  const totalPipelineValue = result.reduce((s, r) => s + r.pipelineValue, 0);
  const statesCovered = new Set(result.filter((s) => s.status === 'active_client').map((s) => s.state)).size;

  return NextResponse.json({
    schools: result,
    kpis: {
      totalActiveChapters,
      schoolsWithActiveClient,
      schoolsInPipeline,
      totalPipelineValue,
      statesCovered,
    },
  });
}
