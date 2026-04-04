import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/* ─── Types ─── */
interface ImportRow {
  org_name: string;
  org_type: string;         // fraternity | sorority | council | national | sports | other
  school_name?: string;
  national_org_name?: string;
  stage?: string;
  temperature?: string;
  value?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  contact_role?: string;
  conference?: string;
  notes?: string;
  assigned_to?: string;     // employee name or id
  next_followup?: string;   // YYYY-MM-DD
}

interface ImportResult {
  row: number;
  org_name: string;
  status: 'created' | 'skipped' | 'error';
  deal_id?: string;
  reason?: string;
}

const VALID_STAGES = ['lead', 'demo_booked', 'first_demo', 'second_call', 'contract_sent', 'closed_won', 'closed_lost', 'hold_off'];
const VALID_TEMPS = ['hot', 'warm', 'cold'];
const VALID_ORG_TYPES = ['fraternity', 'sorority', 'council', 'national', 'sports', 'other'];

function dealTypeFor(orgType: string): 'local' | 'council' | 'national' {
  if (orgType === 'council') return 'council';
  if (orgType === 'national') return 'national';
  return 'local';
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const body = await req.json();
  const rows: ImportRow[] = body.rows;
  const skipDuplicates: boolean = body.skipDuplicates ?? true;

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
  }
  if (rows.length > 500) {
    return NextResponse.json({ error: 'Max 500 rows per import' }, { status: 400 });
  }

  // Pre-load lookup tables for matching
  const [schoolsRes, natorgsRes, employeesRes] = await Promise.all([
    admin.from('schools').select('id, name, conference'),
    admin.from('national_orgs').select('id, name, abbreviation, type'),
    admin.from('employees').select('id, name').eq('status', 'active'),
  ]);

  const schools = schoolsRes.data || [];
  const nationalOrgs = natorgsRes.data || [];
  const employees = employeesRes.data || [];

  // Helper: fuzzy school match
  function findSchool(name: string | undefined) {
    if (!name) return null;
    const q = name.toLowerCase().trim();
    return schools.find(s => s.name.toLowerCase() === q) ||
           schools.find(s => s.name.toLowerCase().includes(q) || q.includes(s.name.toLowerCase())) ||
           null;
  }

  // Helper: fuzzy national org match
  function findNationalOrg(name: string | undefined) {
    if (!name) return null;
    const q = name.toLowerCase().trim();
    return nationalOrgs.find(n =>
      n.name.toLowerCase() === q ||
      (n.abbreviation && n.abbreviation.toLowerCase() === q)
    ) || nationalOrgs.find(n =>
      n.name.toLowerCase().includes(q) || q.includes(n.name.toLowerCase())
    ) || null;
  }

  // Helper: find employee by name or id
  function findEmployee(ref: string | undefined) {
    if (!ref) return null;
    const q = ref.toLowerCase().trim();
    return employees.find(e => e.id === ref || e.name.toLowerCase() === q) || null;
  }

  const results: ImportResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;

    // Validate required fields
    if (!row.org_name?.trim()) {
      results.push({ row: rowNum, org_name: row.org_name || '', status: 'error', reason: 'org_name is required' });
      continue;
    }
    const orgType = (row.org_type || 'other').toLowerCase().trim();
    if (!VALID_ORG_TYPES.includes(orgType)) {
      results.push({ row: rowNum, org_name: row.org_name, status: 'error', reason: `Invalid org_type: "${orgType}". Must be one of: ${VALID_ORG_TYPES.join(', ')}` });
      continue;
    }

    const stage = (row.stage || 'lead').toLowerCase().trim();
    if (!VALID_STAGES.includes(stage)) {
      results.push({ row: rowNum, org_name: row.org_name, status: 'error', reason: `Invalid stage: "${stage}"` });
      continue;
    }

    const temperature = (row.temperature || 'warm').toLowerCase().trim();
    if (!VALID_TEMPS.includes(temperature)) {
      results.push({ row: rowNum, org_name: row.org_name, status: 'error', reason: `Invalid temperature: "${temperature}"` });
      continue;
    }

    const value = row.value ? parseInt(row.value.replace(/[^0-9]/g, '')) || 0 : 0;

    // Match school
    const school = findSchool(row.school_name);

    // Match national org
    const nationalOrg = findNationalOrg(row.national_org_name);

    // Match employee
    const employee = findEmployee(row.assigned_to);

    // Determine org name
    const finalOrgName = row.org_name.trim();

    // Find or create org
    let orgId: string;
    let existingOrgQuery = admin.from('organizations').select('id');
    if (school) {
      existingOrgQuery = existingOrgQuery.eq('school_id', school.id);
    }
    if (nationalOrg && (orgType === 'fraternity' || orgType === 'sorority')) {
      existingOrgQuery = existingOrgQuery.eq('national_org_id', nationalOrg.id);
    } else {
      existingOrgQuery = existingOrgQuery.ilike('name', finalOrgName);
    }

    const { data: existingOrgs } = await existingOrgQuery.limit(1);

    if (existingOrgs && existingOrgs.length > 0) {
      orgId = existingOrgs[0].id;
    } else {
      const { data: newOrg, error: orgErr } = await admin.from('organizations').insert({
        name: finalOrgName,
        school_id: school?.id || null,
        national_org_id: (orgType === 'fraternity' || orgType === 'sorority') ? (nationalOrg?.id || null) : null,
        type: orgType === 'council' ? 'ifc' : 'chapter',
        status: 'prospect',
      }).select('id').single();

      if (orgErr || !newOrg) {
        results.push({ row: rowNum, org_name: row.org_name, status: 'error', reason: `Failed to create org: ${orgErr?.message}` });
        continue;
      }
      orgId = newOrg.id;
    }

    // Check for duplicate deal if skipDuplicates
    if (skipDuplicates) {
      const { data: existingDeals } = await admin
        .from('pipeline_deals')
        .select('id')
        .eq('org_id', orgId)
        .not('stage', 'in', '("closed_lost","hold_off")')
        .limit(1);

      if (existingDeals && existingDeals.length > 0) {
        results.push({ row: rowNum, org_name: row.org_name, status: 'skipped', reason: 'Active deal already exists for this org' });
        continue;
      }
    }

    // Create contact (optional)
    let contactId: string | null = null;
    if (row.contact_name?.trim()) {
      const { data: newContact } = await admin.from('contacts').insert({
        org_id: orgId,
        name: row.contact_name.trim(),
        phone: row.contact_phone?.trim() || null,
        email: row.contact_email?.trim() || null,
        role: row.contact_role?.trim() || 'president',
      }).select('id').single();
      if (newContact) contactId = newContact.id;
    }

    // Create deal
    const { data: newDeal, error: dealErr } = await admin.from('pipeline_deals').insert({
      org_id: orgId,
      contact_id: contactId,
      deal_type: dealTypeFor(orgType),
      stage,
      temperature,
      value,
      assigned_to: employee?.id || null,
      conference: row.conference?.trim() || school?.conference || null,
      notes: row.notes?.trim() || null,
      next_followup: row.next_followup?.trim() || null,
      last_touched: new Date().toISOString(),
    }).select('id').single();

    if (dealErr || !newDeal) {
      results.push({ row: rowNum, org_name: row.org_name, status: 'error', reason: `Failed to create deal: ${dealErr?.message}` });
      continue;
    }

    results.push({ row: rowNum, org_name: row.org_name, status: 'created', deal_id: newDeal.id });
  }

  const created = results.filter(r => r.status === 'created').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const errors = results.filter(r => r.status === 'error').length;

  return NextResponse.json({ created, skipped, errors, results });
}
