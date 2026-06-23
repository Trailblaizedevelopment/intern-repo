import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const url = req.nextUrl;
  const stage = url.searchParams.get('stage');
  const assigned_to = url.searchParams.get('assigned_to');
  const school_id = url.searchParams.get('school_id');
  const deal_type = url.searchParams.get('deal_type');
  const temperature = url.searchParams.get('temperature');
  const conference = url.searchParams.get('conference');
  const search = url.searchParams.get('search');
  const overdue = url.searchParams.get('overdue');
  const category = url.searchParams.get('category');
  const limitParam = parseInt(url.searchParams.get('limit') ?? '500');
  const safeLimit = Math.min(Math.max(limitParam, 1), 500);

  let query = admin
    .from('pipeline_deals')
    .select(`
      *,
      organization:organizations(*, school:schools(*), national_org:national_orgs(*)),
      contact:contacts(*),
      deal_contacts(
        id,
        is_primary,
        contact:contacts(id, name, email, phone, role)
      )
    `)
    .order('next_followup', { ascending: true, nullsFirst: false })
    .limit(safeLimit);

  if (stage && stage !== 'all') query = query.eq('stage', stage);
  if (assigned_to) query = query.eq('assigned_to', assigned_to);
  if (deal_type) query = query.eq('deal_type', deal_type);
  if (temperature) query = query.eq('temperature', temperature);
  if (conference) query = query.eq('conference', conference);
  if (category && category !== 'all') query = query.eq('category', category);
  if (school_id) query = query.eq('organization.school_id', school_id);
  if (overdue === 'true') {
    query = query.lt('next_followup', new Date().toISOString().split('T')[0]);
  }
  // NOTE: Do NOT add a Supabase .or() filter for `search` here.
  // Org name, school name, and contact name live on joined tables and cannot
  // be filtered at the DB level without a more complex query. The post-filter
  // below handles all search fields after the join. Adding a premature
  // notes/conference .or() would silently exclude deals where only the org
  // name matches the query (the most common case).

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Post-filter for search — covers org name, school, contact name, notes, conference
  let results = data || [];
  if (search) {
    const s = search.toLowerCase();
    results = results.filter(d =>
      d.organization?.name?.toLowerCase().includes(s) ||
      d.organization?.school?.name?.toLowerCase().includes(s) ||
      d.contact?.name?.toLowerCase().includes(s) ||
      d.notes?.toLowerCase().includes(s) ||
      d.conference?.toLowerCase().includes(s)
    );
  }

  return NextResponse.json(results);
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const body = await req.json();

  // ── Validation: required fields ──
  if (!body.org_id) {
    return NextResponse.json({ error: 'org_id is required. Every deal must be linked to an organization.' }, { status: 400 });
  }
  if (!body.assigned_to) {
    return NextResponse.json({ error: 'assigned_to is required. Every deal must have a rep assigned.' }, { status: 400 });
  }
  if (!body.stage) {
    return NextResponse.json({ error: 'stage is required.' }, { status: 400 });
  }

  // ── Validation: naming standard ──
  // Verify the linked organization follows "National Org @ University" format
  if (body.org_id) {
    const { data: org } = await admin
      .from('organizations')
      .select('name, school:school_id(name), national_org:national_org_id(name)')
      .eq('id', body.org_id)
      .single();
    
    if (org) {
      const school = (org as any).school;
      const natOrg = (org as any).national_org;
      // Warn (don't block) if org name doesn't follow standard
      if (school?.name && natOrg?.name) {
        const expected = `${natOrg.name} @ ${school.name}`;
        if (org.name !== expected && !org.name.includes('@') && !org.name.startsWith('IFC')) {
          // Auto-fix: update the org name to follow standard
          await admin.from('organizations').update({ name: `${school.name} ${natOrg.name}` }).eq('id', body.org_id);
        }
      }
    }
  }

  // ── Validation: Closed Won requires value > 0 ──
  if (body.stage === 'closed_won' && (!body.value || body.value <= 0)) {
    return NextResponse.json({ error: 'Closed Won deals must have a value > $0. Define: space created + payment confirmed.' }, { status: 400 });
  }

  const { data, error } = await admin.from('pipeline_deals').insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
