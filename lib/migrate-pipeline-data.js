#!/usr/bin/env node
/**
 * Pipeline V2 Data Migration
 * Migrates existing deals + enterprise_contracts into the new normalized schema.
 * Run AFTER seed-pipeline-v2.js
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uoemlefauspgmmpeoilq.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvZW1sZWZhdXNwZ21tcGVvaWxxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTkxNzUyMCwiZXhwIjoyMDg1NDkzNTIwfQ.U5CcwQ8KiL09CwiXKxAt-SgxpVnykUVjMwzyRUalwRs';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Map deal.organization to school name
const SCHOOL_MAP = {
  'Alabama': 'University of Alabama',
  'Arkansas': 'University of Arkansas',
  'Auburn': 'Auburn University',
  'Boulder': 'University of Colorado Boulder',
  'Chapman': 'Chapman University',
  'Clemson': 'Clemson University',
  'Colorado State': 'Colorado State University',
  'Florida': 'University of Florida',
  'Georgia': 'University of Georgia',
  'KU': 'University of Kansas',
  'LSU': 'Louisiana State University',
  'Michigan State': 'Michigan State University',
  'MSU': 'Mississippi State University',
  'Ole Miss': 'University of Mississippi',
  'SMU': 'Southern Methodist University',
  'TCU': 'Texas Christian University',
  'Temple': 'Temple University',
  'Tennessee': 'University of Tennessee',
  'Texas': 'University of Texas',
  'Texas A&M': 'Texas A&M University',
  'Texas Tech': 'Texas Tech University',
  'UC Berkeley': 'University of California Berkeley',
  'UNC': 'University of North Carolina',
  'USC': 'University of Southern California',
};

// Map deal.fraternity (abbreviated) to full national org name
const FRAT_MAP = {
  'AEPi': 'Alpha Epsilon Pi',
  'ATO': 'Alpha Tau Omega',
  'Alpha Phi': 'Alpha Phi',
  'BYX': null, // Not NIC - skip national link
  'Beta': 'Beta Theta Pi',
  'Chi Omega': 'Chi Omega',
  'Chi Phi': 'Chi Phi',
  'DKA': null, // Unknown
  'DKE': 'Delta Kappa Epsilon',
  'DTD': 'Delta Tau Delta',
  'Delt': 'Delta Tau Delta',
  'Delta Chi': 'Delta Chi',
  'FIJI': 'Phi Gamma Delta',
  'Fiji': 'Phi Gamma Delta',
  'KA': 'Kappa Alpha Order',
  'KKG': 'Kappa Kappa Gamma',
  'Kappa Delta Rho': 'Kappa Delta Rho',
  'Kappa Sig': 'Kappa Sigma',
  'Kappa Sigma': 'Kappa Sigma',
  'Lambda Chi': 'Lambda Chi Alpha',
  'Phi Delt': 'Phi Delta Theta',
  'Phi Gamma Delta': 'Phi Gamma Delta',
  'Phi Kap': 'Phi Kappa Sigma',
  'Phi Kappa Sig': 'Phi Kappa Sigma',
  'Pi Kap': 'Pi Kappa Phi',
  'Pi Kapp': 'Pi Kappa Phi',
  'Pike': 'Pi Kappa Alpha',
  'SAE': 'Sigma Alpha Epsilon',
  'Sig Chi': 'Sigma Chi',
  'Sig Ep': 'Sigma Phi Epsilon',
  'Sig Nu': 'Sigma Nu',
  'Sigma Alpha Mu': 'Sigma Alpha Mu',
  'Sigma Chi': 'Sigma Chi',
  'Sigma Chi (EX)': 'Sigma Chi',
  'Sigma Nu': 'Sigma Nu',
  'Sigma Pi': 'Sigma Pi',
  'TKE': 'Tau Kappa Epsilon',
  'Theta Chi': 'Theta Chi',
  'Theta Xi': 'Theta Xi',
};

async function migrate() {
  console.log('Starting data migration...');

  // Load reference data
  const { data: schools } = await supabase.from('schools').select('*');
  const { data: nationals } = await supabase.from('national_orgs').select('*');
  const { data: deals } = await supabase.from('deals').select('*');
  const { data: enterprise } = await supabase.from('enterprise_contracts').select('*');

  if (!schools?.length || !nationals?.length) {
    console.error('No schools or nationals found. Run seed-pipeline-v2.js first.');
    return;
  }

  // Check if already migrated
  const { count } = await supabase.from('pipeline_deals').select('*', { count: 'exact', head: true });
  if (count && count > 0) {
    console.log(`pipeline_deals already has ${count} rows. Skipping migration.`);
    return;
  }

  console.log(`Processing ${deals?.length || 0} deals and ${enterprise?.length || 0} enterprise contracts...`);

  const schoolByName = {};
  schools.forEach(s => { schoolByName[s.name] = s; });

  const nationalByName = {};
  nationals.forEach(n => { nationalByName[n.name] = n; });

  // Track created orgs to avoid duplicates
  const orgCache = {}; // key: "schoolId:nationalOrgId:type" => org

  async function getOrCreateOrg(schoolId, nationalOrgId, name, type) {
    const key = `${schoolId || 'null'}:${nationalOrgId || 'null'}:${name}`;
    if (orgCache[key]) return orgCache[key];

    const { data, error } = await supabase.from('organizations').insert({
      school_id: schoolId,
      national_org_id: nationalOrgId,
      name,
      type,
      status: 'prospect',
    }).select().single();

    if (error) {
      console.error('Error creating org:', name, error.message);
      return null;
    }
    orgCache[key] = data;
    return data;
  }

  // Migrate deals
  let migrated = 0;
  for (const deal of (deals || [])) {
    const schoolName = SCHOOL_MAP[deal.organization];
    const school = schoolName ? schoolByName[schoolName] : null;

    const nationalName = deal.fraternity ? FRAT_MAP[deal.fraternity] : null;
    const national = nationalName ? nationalByName[nationalName] : null;

    // Determine org type and name
    const orgName = `${deal.organization} ${deal.fraternity || 'Unknown'}`.trim();
    const orgType = 'chapter';

    const org = await getOrCreateOrg(
      school?.id || null,
      national?.id || null,
      orgName,
      orgType
    );

    // Create contact if we have info
    let contactId = null;
    if (deal.contact_name) {
      const { data: contact, error: ce } = await supabase.from('contacts').insert({
        org_id: org?.id || null,
        name: deal.contact_name,
        email: deal.email || null,
        phone: deal.phone || null,
        role: 'president',
      }).select().single();
      if (contact) contactId = contact.id;
      if (ce) console.error('Contact error:', ce.message);
    }

    // Create pipeline deal
    const { error: de } = await supabase.from('pipeline_deals').insert({
      org_id: org?.id || null,
      contact_id: contactId,
      deal_type: 'local',
      stage: deal.stage || 'lead',
      value: deal.value || 0,
      temperature: deal.temperature || 'cold',
      next_followup: deal.next_followup || null,
      last_touched: deal.last_contact || null,
      followup_count: deal.followup_count || 0,
      notes: deal.notes || null,
      conference: deal.conference || null,
      created_at: deal.created_at,
    });

    if (de) console.error('Deal error:', de.message);
    else migrated++;
  }

  console.log(`Migrated ${migrated} deals`);

  // Migrate enterprise contracts
  let ecMigrated = 0;
  for (const ec of (enterprise || [])) {
    // Enterprise contracts are IFC/council or national deals
    const isIfc = ec.type === 'ifc';
    const schoolName = SCHOOL_MAP[ec.organization];
    const school = schoolName ? schoolByName[schoolName] : null;

    const orgName = isIfc ? `IFC ${ec.organization}` : ec.organization;
    const orgType = isIfc ? 'ifc' : 'chapter';

    const org = await getOrCreateOrg(
      school?.id || null,
      null,
      orgName,
      orgType
    );

    let contactId = null;
    if (ec.contact_name) {
      const { data: contact } = await supabase.from('contacts').insert({
        org_id: org?.id || null,
        name: ec.contact_name,
        email: ec.contact_email || null,
        role: isIfc ? 'fsl_director' : 'nationals_rep',
      }).select().single();
      if (contact) contactId = contact.id;
    }

    // Map enterprise stage to pipeline stage
    const stageMap = {
      'prospecting': 'lead',
      'negotiation': 'second_call',
      'contract_sent': 'contract_sent',
      'signed': 'closed_won',
      'lost': 'closed_lost',
    };

    const { error: de } = await supabase.from('pipeline_deals').insert({
      org_id: org?.id || null,
      contact_id: contactId,
      deal_type: isIfc ? 'council' : 'national',
      stage: stageMap[ec.stage] || 'lead',
      value: ec.value || 0,
      temperature: 'warm',
      notes: ec.notes || null,
      conference: school?.conference || null,
      created_at: ec.created_at,
    });

    if (de) console.error('EC error:', de.message);
    else ecMigrated++;
  }

  console.log(`Migrated ${ecMigrated} enterprise contracts`);
  console.log('Migration complete!');
}

migrate().catch(console.error);
