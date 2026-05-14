#!/usr/bin/env node
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://uoemlefauspgmmpeoilq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvZW1sZWZhdXNwZ21tcGVvaWxxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTkxNzUyMCwiZXhwIjoyMDg1NDkzNTIwfQ.U5CcwQ8KiL09CwiXKxAt-SgxpVnykUVjMwzyRUalwRs';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const leads = [
  // ── ACTIVE (closed/paying) ──
  { org_name: 'Alabama KA',               school: 'Alabama',        contact_name: null,              owner: 'Owen', status: 'Active',    pipeline_value: null,  is_enterprise: false },
  { org_name: 'Ole Miss ATO',             school: 'Ole Miss',       contact_name: null,              owner: 'Owen', status: 'Active',    pipeline_value: null,  is_enterprise: false },
  { org_name: 'Ole Miss Phi Delt',        school: 'Ole Miss',       contact_name: null,              owner: 'Owen', status: 'Active',    pipeline_value: null,  is_enterprise: false },
  { org_name: 'Ole Miss Sigma Pi',        school: 'Ole Miss',       contact_name: null,              owner: 'Owen', status: 'Active',    pipeline_value: null,  is_enterprise: false },
  { org_name: 'Ole Miss Sigma Chi',       school: 'Ole Miss',       contact_name: null,              owner: 'Owen', status: 'Active',    pipeline_value: null,  is_enterprise: false },
  { org_name: 'Boulder Theta Xi',         school: 'Colorado',       contact_name: 'Bryce Kallio',    owner: 'Owen', status: 'Active',    pipeline_value: null,  is_enterprise: false },
  { org_name: 'Tennessee SAE',            school: 'Tennessee',      contact_name: null,              owner: 'Owen', status: 'Active',    pipeline_value: null,  is_enterprise: false },
  { org_name: 'Sigma Alpha Mu @ Miami',   school: 'Miami (OH)',     contact_name: null,              owner: 'Ford', status: 'Active',    pipeline_value: null,  is_enterprise: false },
  { org_name: 'Theta Chi @ Indiana',      school: 'Indiana',        contact_name: null,              owner: 'Owen', status: 'Active',    pipeline_value: null,  is_enterprise: false },
  { org_name: 'K2 Killers @ TAMU',        school: 'Texas A&M',      contact_name: 'Alex Winslow',    owner: 'Owen', status: 'Active',    pipeline_value: null,  is_enterprise: false },
  { org_name: 'Chapman AEPI',             school: 'Chapman',        contact_name: null,              owner: 'Adam', status: 'Active',    pipeline_value: null,  is_enterprise: false },

  // ── CHECK IN (hot/warm prospects) ──
  { org_name: 'KKG @ SMU',                          school: 'SMU',             contact_name: 'Claire Moore',    owner: 'Owen', status: 'Check In', pipeline_value: 3588,   is_enterprise: false },
  { org_name: 'Lambda Chi @ OU',                    school: 'Oklahoma',        contact_name: 'Fiskecooper',     owner: 'Adam', status: 'Check In', pipeline_value: 3588,   is_enterprise: false },
  { org_name: 'Theta Xi Nationals',                 school: 'National',        contact_name: 'Armando',         owner: 'Owen', status: 'Check In', pipeline_value: 40000,  is_enterprise: true  },
  { org_name: 'Delta Psi (Mackay) @ Ole Miss',      school: 'Ole Miss',        contact_name: 'Hayes Hathorn',   owner: 'Owen', status: 'Check In', pipeline_value: 3588,   is_enterprise: false },
  { org_name: 'TCU Sigma Chi',                      school: 'TCU',             contact_name: 'Lucas Rogers',    owner: 'Owen', status: 'Check In', pipeline_value: 3588,   is_enterprise: false },
  { org_name: 'TCU Phi Delt',                       school: 'TCU',             contact_name: 'Clyde Patton',    owner: 'Owen', status: 'Check In', pipeline_value: 3588,   is_enterprise: false },
  { org_name: 'TAMU ATO',                           school: 'Texas A&M',       contact_name: 'Jack Eggi',       owner: 'Owen', status: 'Check In', pipeline_value: 3588,   is_enterprise: false },
  { org_name: 'TAMU SigEp',                         school: 'Texas A&M',       contact_name: 'Will Oliver',     owner: 'Owen', status: 'Check In', pipeline_value: 3588,   is_enterprise: false },
  { org_name: 'Clemson Beta',                       school: 'Clemson',         contact_name: 'William Dixon',   owner: 'Owen', status: 'Check In', pipeline_value: 3588,   is_enterprise: false },
  { org_name: 'Clemson FIJI',                       school: 'Clemson',         contact_name: 'Patrick',         owner: 'Owen', status: 'Check In', pipeline_value: 3588,   is_enterprise: false },
  { org_name: 'KA @ Clemson',                       school: 'Clemson',         contact_name: 'Jack Johnson',    owner: 'Owen', status: 'Check In', pipeline_value: 3588,   is_enterprise: false },
  { org_name: 'LSU KA',                             school: 'LSU',             contact_name: 'Ethan Carmouche', owner: 'Owen', status: 'Check In', pipeline_value: 3588,   is_enterprise: false },
  { org_name: 'IFC LSU',                            school: 'LSU',             contact_name: 'Blake Ranlett',   owner: 'Owen', status: 'Check In', pipeline_value: 20000,  is_enterprise: true  },
  { org_name: 'PIKE @ ASU',                         school: 'Arizona State',   contact_name: null,              owner: 'Owen', status: 'Check In', pipeline_value: 3588,   is_enterprise: false },
  { org_name: 'Beta @ SMU',                         school: 'SMU',             contact_name: null,              owner: 'Owen', status: 'Check In', pipeline_value: 3588,   is_enterprise: false },
  { org_name: 'TAMU FIJI',                          school: 'Texas A&M',       contact_name: 'Blake Meary',     owner: 'Owen', status: 'Check In', pipeline_value: 3588,   is_enterprise: false },
  { org_name: 'Auburn Theta Chi',                   school: 'Auburn',          contact_name: 'Joseph Couch',    owner: 'Owen', status: 'Check In', pipeline_value: 3588,   is_enterprise: false },
  { org_name: 'Arkansas Kappa Sig',                 school: 'Arkansas',        contact_name: 'Hudson Kincaid',  owner: 'Owen', status: 'Check In', pipeline_value: 3588,   is_enterprise: false },
  { org_name: 'Kappa Sig @ TCU',                    school: 'TCU',             contact_name: 'Sam Rivas',       owner: 'Owen', status: 'Check In', pipeline_value: 3588,   is_enterprise: false },
  { org_name: 'TCU Beta',                           school: 'TCU',             contact_name: 'Derek Yang',      owner: 'Owen', status: 'Check In', pipeline_value: 3588,   is_enterprise: false },
  { org_name: 'Texas Tech Phi Delt',                school: 'Texas Tech',      contact_name: 'Luke Rumsey',     owner: 'Owen', status: 'Check In', pipeline_value: 3588,   is_enterprise: false },
  { org_name: 'IFC TCU',                            school: 'TCU',             contact_name: null,              owner: 'Owen', status: 'Check In', pipeline_value: 46000,  is_enterprise: true  },
  { org_name: 'IFC Ole Miss',                       school: 'Ole Miss',        contact_name: null,              owner: 'Owen', status: 'Check In', pipeline_value: 20000,  is_enterprise: true  },
  { org_name: 'IFC UMiami',                         school: 'Miami',           contact_name: 'Josh Sackett',    owner: 'Owen', status: 'Check In', pipeline_value: 20000,  is_enterprise: true  },
  { org_name: 'Alpha Delta Pi @ SC',                school: 'South Carolina',  contact_name: 'Momo Farmer',     owner: 'Owen', status: 'Check In', pipeline_value: 3588,   is_enterprise: false },
  { org_name: 'Sigma Chi International',            school: 'National',        contact_name: 'Lee Beauchamp',   owner: 'Team', status: 'Check In', pipeline_value: 250000, is_enterprise: true  },
  { org_name: 'SAM Nationals',                      school: 'National',        contact_name: 'Hayden Demos',    owner: 'Ford', status: 'Check In', pipeline_value: 250000, is_enterprise: true  },
  { org_name: 'Phi Delt @ Arizona',                 school: 'Arizona',         contact_name: null,              owner: 'Owen', status: 'Check In', pipeline_value: 3588,   is_enterprise: false },
  { org_name: 'Lambda Chi @ Eastern Illinois',      school: 'Eastern Illinois',contact_name: null,              owner: 'Owen', status: 'Check In', pipeline_value: 3588,   is_enterprise: false },
  { org_name: 'ATO @ Oklahoma State',               school: 'Oklahoma State',  contact_name: null,              owner: 'Owen', status: 'Check In', pipeline_value: 3588,   is_enterprise: false },
  { org_name: 'Sigma Chi @ Sacred Heart',           school: 'Sacred Heart',    contact_name: null,              owner: 'Owen', status: 'Check In', pipeline_value: 3588,   is_enterprise: false },
  { org_name: 'Sigma Chi @ WL University',          school: 'Waterloo (Canada)',contact_name: null,             owner: 'Owen', status: 'Check In', pipeline_value: 3588,   is_enterprise: false },
  { org_name: 'Alpha Chi Rho @ Robert Morris',      school: 'Robert Morris',   contact_name: null,              owner: 'Owen', status: 'Check In', pipeline_value: 3588,   is_enterprise: false },

  // ── HOLD OFF (back burner / stalled) ──
  { org_name: 'Arkansas Phi Delt',        school: 'Arkansas',        contact_name: 'Mason Harris',   owner: 'Owen', status: 'Hold Off', pipeline_value: 3588,  is_enterprise: false },
  { org_name: 'Arkansas Chi Omega',       school: 'Arkansas',        contact_name: null,             owner: 'Owen', status: 'Hold Off', pipeline_value: 3588,  is_enterprise: false },
  { org_name: 'Georgia Chi Phi',          school: 'Georgia',         contact_name: 'Boon Elliott',   owner: 'Owen', status: 'Hold Off', pipeline_value: 3588,  is_enterprise: false },
  { org_name: 'Michigan State Phi Kap Sig',school: 'Michigan State', contact_name: 'Sam',            owner: 'Owen', status: 'Hold Off', pipeline_value: 3588,  is_enterprise: false },
  { org_name: 'Boulder SAE',              school: 'Colorado',        contact_name: 'Nathan Wilson',  owner: 'Owen', status: 'Hold Off', pipeline_value: 3588,  is_enterprise: false },
  { org_name: 'Temple KDR',              school: 'Temple',           contact_name: 'Ben Santorini',  owner: 'Owen', status: 'Hold Off', pipeline_value: 3588,  is_enterprise: false },
  { org_name: 'Alabama KKG',             school: 'Alabama',          contact_name: null,             owner: 'Owen', status: 'Hold Off', pipeline_value: 3588,  is_enterprise: false },
  { org_name: 'Alabama DKE',             school: 'Alabama',          contact_name: null,             owner: 'Owen', status: 'Hold Off', pipeline_value: 3588,  is_enterprise: false },
  { org_name: 'Ole Miss KKG',            school: 'Ole Miss',         contact_name: null,             owner: 'Owen', status: 'Hold Off', pipeline_value: 3588,  is_enterprise: false },
  { org_name: 'South Alabama KA',        school: 'South Alabama',    contact_name: null,             owner: 'Owen', status: 'Hold Off', pipeline_value: 3588,  is_enterprise: false },
  { org_name: 'IFC Berkeley',            school: 'UC Berkeley',      contact_name: 'Jeff Woods',     owner: 'Owen', status: 'Hold Off', pipeline_value: 20000, is_enterprise: true  },
  { org_name: 'IFC Georgia Tech',        school: 'Georgia Tech',     contact_name: 'Noah Pastula',   owner: 'Owen', status: 'Hold Off', pipeline_value: 20000, is_enterprise: true  },
  { org_name: 'IFC Mississippi State',   school: 'Mississippi State',contact_name: null,             owner: 'Owen', status: 'Hold Off', pipeline_value: 20000, is_enterprise: true  },
  { org_name: 'IFC Missouri',            school: 'Missouri',         contact_name: null,             owner: 'Owen', status: 'Hold Off', pipeline_value: 20000, is_enterprise: true  },
  { org_name: 'IFC Alabama',             school: 'Alabama',          contact_name: null,             owner: 'Owen', status: 'Hold Off', pipeline_value: 20000, is_enterprise: true  },
  { org_name: 'IFC Tennessee',           school: 'Tennessee',        contact_name: null,             owner: 'Owen', status: 'Hold Off', pipeline_value: 20000, is_enterprise: true  },
  { org_name: 'IFC Michigan State',      school: 'Michigan State',   contact_name: 'Cliff Kendall',  owner: 'Owen', status: 'Hold Off', pipeline_value: 20000, is_enterprise: true  },
  { org_name: 'IFC Auburn',              school: 'Auburn',           contact_name: null,             owner: 'Owen', status: 'Hold Off', pipeline_value: 20000, is_enterprise: true  },
  { org_name: 'IFC CNU',                 school: 'CNU',              contact_name: 'Jason Trager',   owner: 'Owen', status: 'Hold Off', pipeline_value: 20000, is_enterprise: true  },
  { org_name: 'Alabama Sig Ep',          school: 'Alabama',          contact_name: 'Reid Patterson', owner: 'Owen', status: 'Hold Off', pipeline_value: 3588,  is_enterprise: false },
  { org_name: 'Texas SAE',               school: 'Texas',            contact_name: null,             owner: 'Owen', status: 'Hold Off', pipeline_value: 3588,  is_enterprise: false },
  { org_name: 'LSU TKE',                 school: 'LSU',              contact_name: null,             owner: 'Owen', status: 'Hold Off', pipeline_value: 3588,  is_enterprise: false },
  { org_name: 'Chapman Beta',            school: 'Chapman',          contact_name: null,             owner: 'Adam', status: 'Hold Off', pipeline_value: 3588,  is_enterprise: false },
  { org_name: 'TAMU PIKE',               school: 'Texas A&M',        contact_name: null,             owner: 'Owen', status: 'Hold Off', pipeline_value: 3588,  is_enterprise: false },
  { org_name: 'Texas SigEp',             school: 'Texas',            contact_name: null,             owner: 'Owen', status: 'Hold Off', pipeline_value: 3588,  is_enterprise: false },
  { org_name: 'Parrish Dallas (High School)', school: 'Parrish (Dallas)', contact_name: null,        owner: 'Owen', status: 'Hold Off', pipeline_value: 0,     is_enterprise: false },
];

async function seed() {
  // Clear existing rows first
  const { error: delErr } = await supabase.from('sales_leads').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delErr) { console.error('Delete error:', delErr.message); process.exit(1); }
  console.log('Cleared existing rows.');

  const { data, error } = await supabase.from('sales_leads').insert(leads).select();
  if (error) { console.error('Insert error:', error.message); process.exit(1); }
  console.log(`Seeded ${data.length} leads.`);

  const counts = { Active: 0, 'Check In': 0, 'Hold Off': 0 };
  data.forEach(r => counts[r.status]++);
  console.log(`Active: ${counts['Active']} | Check In: ${counts['Check In']} | Hold Off: ${counts['Hold Off']}`);
}

seed();
