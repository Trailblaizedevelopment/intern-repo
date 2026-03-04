#!/usr/bin/env node
/**
 * Pipeline V2 Seed Script
 * Seeds national_orgs and schools tables.
 * Run AFTER the migration SQL has been executed.
 * Usage: NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node lib/seed-pipeline-v2.js
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uoemlefauspgmmpeoilq.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvZW1sZWZhdXNwZ21tcGVvaWxxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTkxNzUyMCwiZXhwIjoyMDg1NDkzNTIwfQ.U5CcwQ8KiL09CwiXKxAt-SgxpVnykUVjMwzyRUalwRs';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const NIC_FRATERNITIES = [
  { name: 'Acacia', abbreviation: 'Acacia' },
  { name: 'Alpha Chi Rho', abbreviation: 'AXP' },
  { name: 'Alpha Delta Phi', abbreviation: 'ADP' },
  { name: 'Alpha Epsilon Pi', abbreviation: 'AEPi' },
  { name: 'Alpha Gamma Rho', abbreviation: 'AGR' },
  { name: 'Alpha Kappa Lambda', abbreviation: 'AKL' },
  { name: 'Alpha Phi Alpha', abbreviation: 'APA' },
  { name: 'Alpha Phi Delta', abbreviation: 'APD' },
  { name: 'Alpha Sigma Phi', abbreviation: 'ASP' },
  { name: 'Alpha Tau Omega', abbreviation: 'ATO' },
  { name: 'Beta Chi Theta', abbreviation: 'BCT' },
  { name: 'Beta Sigma Psi', abbreviation: 'BSP' },
  { name: 'Beta Theta Pi', abbreviation: 'Beta' },
  { name: 'Chi Phi', abbreviation: 'Chi Phi' },
  { name: 'Chi Psi', abbreviation: 'Chi Psi' },
  { name: 'Delta Chi', abbreviation: 'DChi' },
  { name: 'Delta Kappa Epsilon', abbreviation: 'DKE' },
  { name: 'Delta Phi', abbreviation: 'DPhi' },
  { name: 'Delta Sigma Phi', abbreviation: 'DSP' },
  { name: 'Delta Tau Delta', abbreviation: 'DTD' },
  { name: 'Delta Upsilon', abbreviation: 'DU' },
  { name: 'FarmHouse', abbreviation: 'FH' },
  { name: 'Iota Phi Theta', abbreviation: 'IPT' },
  { name: 'Kappa Alpha Order', abbreviation: 'KA' },
  { name: 'Kappa Alpha Psi', abbreviation: 'KAP' },
  { name: 'Kappa Delta Rho', abbreviation: 'KDR' },
  { name: 'Kappa Sigma', abbreviation: 'KSig' },
  { name: 'Lambda Chi Alpha', abbreviation: 'LCA' },
  { name: 'Lambda Sigma Upsilon', abbreviation: 'LSU' },
  { name: 'Lambda Theta Phi', abbreviation: 'LTP' },
  { name: 'Lambda Upsilon Lambda', abbreviation: 'LUL' },
  { name: 'Nu Alpha Kappa', abbreviation: 'NAK' },
  { name: 'Omega Psi Phi', abbreviation: 'OPP' },
  { name: 'Phi Beta Sigma', abbreviation: 'PBS' },
  { name: 'Phi Delta Theta', abbreviation: 'Phi Delt' },
  { name: 'Phi Gamma Delta', abbreviation: 'FIJI' },
  { name: 'Phi Iota Alpha', abbreviation: 'PIA' },
  { name: 'Phi Kappa Psi', abbreviation: 'Phi Psi' },
  { name: 'Phi Kappa Sigma', abbreviation: 'PKS' },
  { name: 'Phi Kappa Tau', abbreviation: 'PKT' },
  { name: 'Phi Kappa Theta', abbreviation: 'PKTh' },
  { name: 'Phi Lambda Chi', abbreviation: 'PLC' },
  { name: 'Phi Sigma Kappa', abbreviation: 'PSK' },
  { name: 'Pi Delta Psi', abbreviation: 'PDP' },
  { name: 'Pi Kappa Alpha', abbreviation: 'Pike' },
  { name: 'Pi Kappa Phi', abbreviation: 'Pi Kapp' },
  { name: 'Pi Lambda Phi', abbreviation: 'PLP' },
  { name: 'Psi Upsilon', abbreviation: 'Psi U' },
  { name: 'Sigma Alpha Epsilon', abbreviation: 'SAE' },
  { name: 'Sigma Alpha Mu', abbreviation: 'SAM' },
  { name: 'Sigma Chi', abbreviation: 'Sig Chi' },
  { name: 'Sigma Lambda Beta', abbreviation: 'SLB' },
  { name: 'Sigma Nu', abbreviation: 'Sig Nu' },
  { name: 'Sigma Phi Epsilon', abbreviation: 'Sig Ep' },
  { name: 'Sigma Phi Society', abbreviation: 'SPS' },
  { name: 'Sigma Pi', abbreviation: 'Sig Pi' },
  { name: 'Sigma Tau Gamma', abbreviation: 'STG' },
  { name: 'Tau Kappa Epsilon', abbreviation: 'TKE' },
  { name: 'Theta Chi', abbreviation: 'Theta Chi' },
  { name: 'Theta Delta Chi', abbreviation: 'TDC' },
  { name: 'Theta Tau', abbreviation: 'Theta Tau' },
  { name: 'Theta Xi', abbreviation: 'Theta Xi' },
  { name: 'Triangle', abbreviation: 'Triangle' },
  { name: 'Zeta Beta Tau', abbreviation: 'ZBT' },
  { name: 'Zeta Phi Beta', abbreviation: 'ZPB' },
  { name: 'Zeta Psi', abbreviation: 'Zeta Psi' },
];

const NPC_SORORITIES = [
  { name: 'Alpha Chi Omega', abbreviation: 'AChiO' },
  { name: 'Alpha Delta Pi', abbreviation: 'ADPi' },
  { name: 'Alpha Epsilon Phi', abbreviation: 'AEPhi' },
  { name: 'Alpha Gamma Delta', abbreviation: 'AGD' },
  { name: 'Alpha Omicron Pi', abbreviation: 'AOPi' },
  { name: 'Alpha Phi', abbreviation: 'APhi' },
  { name: 'Alpha Sigma Alpha', abbreviation: 'ASA' },
  { name: 'Alpha Sigma Tau', abbreviation: 'AST' },
  { name: 'Alpha Xi Delta', abbreviation: 'AXiD' },
  { name: 'Chi Omega', abbreviation: 'ChiO' },
  { name: 'Delta Delta Delta', abbreviation: 'Tri Delt' },
  { name: 'Delta Gamma', abbreviation: 'DG' },
  { name: 'Delta Phi Epsilon', abbreviation: 'DPhiE' },
  { name: 'Delta Zeta', abbreviation: 'DZ' },
  { name: 'Gamma Phi Beta', abbreviation: 'GPB' },
  { name: 'Kappa Alpha Theta', abbreviation: 'Theta' },
  { name: 'Kappa Delta', abbreviation: 'KD' },
  { name: 'Kappa Kappa Gamma', abbreviation: 'KKG' },
  { name: 'Phi Mu', abbreviation: 'Phi Mu' },
  { name: 'Phi Sigma Sigma', abbreviation: 'Phi Sig' },
  { name: 'Pi Beta Phi', abbreviation: 'Pi Phi' },
  { name: 'Sigma Delta Tau', abbreviation: 'SDT' },
  { name: 'Sigma Kappa', abbreviation: 'SK' },
  { name: 'Sigma Sigma Sigma', abbreviation: 'Tri Sig' },
  { name: 'Theta Phi Alpha', abbreviation: 'TPA' },
  { name: 'Zeta Tau Alpha', abbreviation: 'ZTA' },
];

const SCHOOLS = [
  // Existing deals schools
  { name: 'University of Alabama', state: 'AL', conference: 'SEC' },
  { name: 'University of Arkansas', state: 'AR', conference: 'SEC' },
  { name: 'Auburn University', state: 'AL', conference: 'SEC' },
  { name: 'University of Colorado Boulder', state: 'CO', conference: 'Big 12' },
  { name: 'Chapman University', state: 'CA', conference: 'WCC' },
  { name: 'Clemson University', state: 'SC', conference: 'ACC' },
  { name: 'Colorado State University', state: 'CO', conference: 'Mountain West' },
  { name: 'University of Florida', state: 'FL', conference: 'SEC' },
  { name: 'University of Georgia', state: 'GA', conference: 'SEC' },
  { name: 'University of Kansas', state: 'KS', conference: 'Big 12' },
  { name: 'Louisiana State University', state: 'LA', conference: 'SEC' },
  { name: 'Michigan State University', state: 'MI', conference: 'Big Ten' },
  { name: 'Mississippi State University', state: 'MS', conference: 'SEC' },
  { name: 'University of Mississippi', state: 'MS', conference: 'SEC' },
  { name: 'Southern Methodist University', state: 'TX', conference: 'ACC' },
  { name: 'Texas Christian University', state: 'TX', conference: 'Big 12' },
  { name: 'Temple University', state: 'PA', conference: 'AAC' },
  { name: 'University of Tennessee', state: 'TN', conference: 'SEC' },
  { name: 'University of Texas', state: 'TX', conference: 'SEC' },
  { name: 'Texas A&M University', state: 'TX', conference: 'SEC' },
  { name: 'Texas Tech University', state: 'TX', conference: 'Big 12' },
  { name: 'University of California Berkeley', state: 'CA', conference: 'Pac-12' },
  { name: 'University of North Carolina', state: 'NC', conference: 'ACC' },
  { name: 'University of Southern California', state: 'CA', conference: 'Big Ten' },
  // Other SEC
  { name: 'University of Kentucky', state: 'KY', conference: 'SEC' },
  { name: 'University of South Carolina', state: 'SC', conference: 'SEC' },
  { name: 'Vanderbilt University', state: 'TN', conference: 'SEC' },
  { name: 'University of Missouri', state: 'MO', conference: 'SEC' },
  { name: 'University of Oklahoma', state: 'OK', conference: 'SEC' },
  // Big Ten
  { name: 'Ohio State University', state: 'OH', conference: 'Big Ten' },
  { name: 'University of Michigan', state: 'MI', conference: 'Big Ten' },
  { name: 'Penn State University', state: 'PA', conference: 'Big Ten' },
  { name: 'University of Wisconsin', state: 'WI', conference: 'Big Ten' },
  { name: 'University of Minnesota', state: 'MN', conference: 'Big Ten' },
  { name: 'University of Iowa', state: 'IA', conference: 'Big Ten' },
  { name: 'University of Illinois', state: 'IL', conference: 'Big Ten' },
  { name: 'Indiana University', state: 'IN', conference: 'Big Ten' },
  { name: 'Purdue University', state: 'IN', conference: 'Big Ten' },
  { name: 'University of Nebraska', state: 'NE', conference: 'Big Ten' },
  { name: 'Northwestern University', state: 'IL', conference: 'Big Ten' },
  { name: 'Rutgers University', state: 'NJ', conference: 'Big Ten' },
  { name: 'University of Maryland', state: 'MD', conference: 'Big Ten' },
  { name: 'University of Oregon', state: 'OR', conference: 'Big Ten' },
  { name: 'University of Washington', state: 'WA', conference: 'Big Ten' },
  { name: 'UCLA', state: 'CA', conference: 'Big Ten' },
  // Big 12
  { name: 'Baylor University', state: 'TX', conference: 'Big 12' },
  { name: 'Oklahoma State University', state: 'OK', conference: 'Big 12' },
  { name: 'Iowa State University', state: 'IA', conference: 'Big 12' },
  { name: 'West Virginia University', state: 'WV', conference: 'Big 12' },
  { name: 'Kansas State University', state: 'KS', conference: 'Big 12' },
  { name: 'University of Cincinnati', state: 'OH', conference: 'Big 12' },
  { name: 'University of Houston', state: 'TX', conference: 'Big 12' },
  { name: 'Brigham Young University', state: 'UT', conference: 'Big 12' },
  { name: 'University of Central Florida', state: 'FL', conference: 'Big 12' },
  { name: 'Arizona State University', state: 'AZ', conference: 'Big 12' },
  { name: 'University of Arizona', state: 'AZ', conference: 'Big 12' },
  { name: 'University of Utah', state: 'UT', conference: 'Big 12' },
];

async function seed() {
  console.log('Seeding national orgs...');
  
  // Check if already seeded
  const { count } = await supabase.from('national_orgs').select('*', { count: 'exact', head: true });
  if (count && count > 0) {
    console.log(`national_orgs already has ${count} rows. Skipping.`);
  } else {
    const fratRows = NIC_FRATERNITIES.map(f => ({ ...f, type: 'fraternity', nic_npc: true }));
    const sorRows = NPC_SORORITIES.map(s => ({ ...s, type: 'sorority', nic_npc: true }));
    
    const { error: e1 } = await supabase.from('national_orgs').insert(fratRows);
    if (e1) { console.error('Error seeding fraternities:', e1.message); return; }
    console.log(`Inserted ${fratRows.length} fraternities`);
    
    const { error: e2 } = await supabase.from('national_orgs').insert(sorRows);
    if (e2) { console.error('Error seeding sororities:', e2.message); return; }
    console.log(`Inserted ${sorRows.length} sororities`);
  }

  console.log('Seeding schools...');
  const { count: schoolCount } = await supabase.from('schools').select('*', { count: 'exact', head: true });
  if (schoolCount && schoolCount > 0) {
    console.log(`schools already has ${schoolCount} rows. Skipping.`);
  } else {
    const { error: e3 } = await supabase.from('schools').insert(SCHOOLS);
    if (e3) { console.error('Error seeding schools:', e3.message); return; }
    console.log(`Inserted ${SCHOOLS.length} schools`);
  }

  console.log('Seed complete!');
}

seed().catch(console.error);
