/**
 * backfill-platform-members.js
 *
 * One-time (re-runnable) sync:
 *  1. Inserts auto-mapped chapter_external_mappings
 *  2. Fetches all alumni profiles from external platform (excluding bulk imports + demos)
 *  3. Resolves each profile's internal chapter_id via the mappings table
 *  4. Upserts into platform_members (keyed on external_user_id)
 *  5. Tries to link to alumni_contacts by email or name
 *
 * Usage: node scripts/backfill-platform-members.js [--dry-run]
 */

const { createClient } = require('@supabase/supabase-js');

const EXT_URL = 'https://ssqpfkiesxwnmphwyezb.supabase.co';
const EXT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzcXBma2llc3h3bm1waHd5ZXpiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDQ0ODY2OSwiZXhwIjoyMDcwMDI0NjY5fQ.pQESJZk85Jm8RJ0DlkszR5rK0lOlixBKmkWUm5Luxb4';
const INT_URL = 'https://uoemlefauspgmmpeoilq.supabase.co';
const INT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvZW1sZWZhdXNwZ21tcGVvaWxxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTkxNzUyMCwiZXhwIjoyMDg1NDkzNTIwfQ.U5CcwQ8KiL09CwiXKxAt-SgxpVnykUVjMwzyRUalwRs';

const DRY_RUN = process.argv.includes('--dry-run');

// Auto-mapped chapter pairs: ext_chapter_id → int_chapter_id + name
const AUTO_MAPPINGS = [
  { external_chapter_id: '714cb482-a927-4b5d-9d48-70601761e8a8', external_name: 'Texas A&M Sigma Chi',                          int_name: 'Texas A&M Sigma Chi' },
  { external_chapter_id: '3304e0a4-812f-4747-9877-747fb0d9a777', external_name: 'SAE @ Tennessee',                               int_name: 'SAE @ Tennessee' },
  { external_chapter_id: '7b1e5a3d-ce08-4ce2-b520-2f4b0a0a2e52', external_name: 'Theta Xi Alpha Eta (CU Boulder)',               int_name: 'Boulder Theta Xi' },
  { external_chapter_id: 'b6f961b9-26b0-4da0-994e-3c128f6194ad', external_name: 'Ole Miss Alpha Tau Omega',                      int_name: 'Ole Miss ATO' },
  { external_chapter_id: 'b25a4acf-59f0-46d4-bb5c-d41fda5b3252', external_name: 'Phi Delta Theta Mississippi Alpha (Ole Miss)',   int_name: 'Ole Miss Phi Delt' },
  { external_chapter_id: 'd1b9fd8a-26b2-4def-8600-d8c09a3ee83b', external_name: 'Alabama Kappa Alpha',                           int_name: 'Alabama KA' },
  { external_chapter_id: 'dec774f8-2a64-4595-be35-c39c4e6e47d2', external_name: 'Ole Miss Sigma Nu',                             int_name: 'Sigma Nu @ Ole Miss' },
  { external_chapter_id: 'fa2c2901-089e-41e4-86c7-768b3d14a110', external_name: 'Delta Kappa Epsilon Chi Chapter (Ole Miss)',     int_name: null },  // no match
  { external_chapter_id: '8ede10e8-b848-427d-8f4a-aacf74cea2c2', external_name: 'Phi Gamma Delta Omega Chi (Chapman)',            int_name: null },  // no match
  { external_chapter_id: 'ff740e3f-c45c-4728-a5d5-22088c19d847', external_name: 'Kappa Sigma Delta-Xi (Ole Miss)',               int_name: 'Ole Miss Kappa Sig' },
];

const BULK_IMPORT_EXT_ID = '404e65ab-1123-44a0-81c7-e8e75118e741';
const DEMO_NAMES = ['Sales Demo Chapter', 'Trailblaize Demo Chapter'];

function normName(s) {
  return (s || '').toLowerCase().trim().replace(/[^a-z]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalize(raw) {
  if (!raw) return null;
  const d = raw.replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d.startsWith('1')) return '+' + d;
  return '+' + d;
}

function phoneVariants(raw) {
  if (!raw) return [];
  const norm = normalize(raw);
  const d = raw.replace(/\D/g, '');
  return [...new Set([norm, d, d.slice(-10)].filter(Boolean))];
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE RUN ===');

  const extDb = createClient(EXT_URL, EXT_KEY);
  const db    = createClient(INT_URL, INT_KEY);

  // 1. Get internal chapter name → id map
  const { data: intChapters } = await db.from('chapters').select('id, chapter_name');
  const chapterByName = {};
  for (const c of intChapters) chapterByName[c.chapter_name.trim()] = c.id;

  // Resolve int_chapter_id for each mapping
  const mappings = AUTO_MAPPINGS.map(m => ({
    ...m,
    internal_chapter_id: m.int_name ? (chapterByName[m.int_name] || null) : null,
  }));

  const validMappings = mappings.filter(m => m.internal_chapter_id);
  const unmappedExt   = mappings.filter(m => !m.internal_chapter_id);
  console.log('Chapter mappings resolved:', validMappings.length, '| No internal match:', unmappedExt.length);
  if (unmappedExt.length) unmappedExt.forEach(m => console.log('  ⚠️  No match:', m.external_name));

  // 2. Upsert chapter_external_mappings
  if (!DRY_RUN && validMappings.length) {
    const { error } = await db.from('chapter_external_mappings').upsert(
      validMappings.map(m => ({
        internal_chapter_id: m.internal_chapter_id,
        external_chapter_id: m.external_chapter_id,
        external_name: m.external_name,
        confidence: 'auto',
      })),
      { onConflict: 'external_chapter_id' }
    );
    if (error) { console.error('Mapping upsert error:', error.message); return; }
    console.log('✅ Chapter mappings upserted');
  }

  // Build ext_chapter_id → int_chapter_id lookup
  const extToInt = Object.fromEntries(validMappings.map(m => [m.external_chapter_id, m.internal_chapter_id]));

  // 3. Fetch all alumni from external platform (exclude bulk import + demos)
  const { data: allProfiles, error: extErr } = await extDb
    .from('profiles')
    .select('id,role,phone,email,first_name,last_name,chapter_id,chapter,grad_year,major,minor,pledge_class,linkedin_url,location,member_status,onboarding_completed,created_at')
    .eq('role', 'alumni');

  if (extErr) { console.error('External fetch error:', extErr.message); return; }

  const profiles = allProfiles.filter(p =>
    p.chapter_id !== BULK_IMPORT_EXT_ID && !DEMO_NAMES.includes(p.chapter)
  );
  console.log('Alumni profiles to sync (excl. bulk/demo):', profiles.length);

  // 4. Fetch internal contacts for cross-linking
  const { data: contacts } = await db.from('alumni_contacts').select('id,email,phone_primary,phone_secondary,first_name,last_name');
  const contactByEmail = new Map();
  const contactByPhone = new Map();
  const contactByName  = new Map();
  for (const c of contacts) {
    if (c.email) contactByEmail.set(c.email.toLowerCase(), c.id);
    for (const p of [c.phone_primary, c.phone_secondary]) {
      for (const v of phoneVariants(p)) contactByPhone.set(v, c.id);
    }
    const nk = normName(c.first_name) + '|' + normName(c.last_name);
    if (!contactByName.has(nk)) contactByName.set(nk, []);
    contactByName.get(nk).push(c.id);
  }

  // 5. Build upsert payload
  const now = new Date().toISOString();
  const rows = profiles.map(p => {
    const internalChapterId = extToInt[p.chapter_id] || null;

    // Try to link to alumni_contact
    let contactId = null;
    if (p.email) contactId = contactByEmail.get(p.email.toLowerCase()) || null;
    if (!contactId && p.phone) {
      for (const v of phoneVariants(p.phone)) {
        if (contactByPhone.has(v)) { contactId = contactByPhone.get(v); break; }
      }
    }
    if (!contactId) {
      const nk = normName(p.first_name) + '|' + normName(p.last_name);
      const found = contactByName.get(nk);
      if (found?.length === 1) contactId = found[0];
    }

    return {
      external_user_id:    p.id,
      external_chapter_id: p.chapter_id,
      chapter_id:          internalChapterId,
      first_name:          p.first_name,
      last_name:           p.last_name,
      email:               p.email,
      phone:               p.phone || null,
      grad_year:           p.grad_year ? parseInt(p.grad_year) : null,
      major:               p.major,
      minor:               p.minor,
      pledge_class:        p.pledge_class,
      linkedin_url:        p.linkedin_url,
      location:            p.location,
      member_status:       p.member_status,
      onboarding_completed: p.onboarding_completed || false,
      signed_up_at:        p.created_at,
      alumni_contact_id:   contactId,
      last_synced_at:      now,
      updated_at:          now,
    };
  });

  const withChapter   = rows.filter(r => r.chapter_id).length;
  const withContact   = rows.filter(r => r.alumni_contact_id).length;
  const withoutChapter = rows.filter(r => !r.chapter_id).length;

  console.log('Records to upsert:', rows.length);
  console.log('  With internal chapter:', withChapter);
  console.log('  Without chapter (unmapped):', withoutChapter);
  console.log('  Linked to alumni_contact:', withContact);

  if (DRY_RUN) {
    console.log('\nSample rows (first 3):');
    rows.slice(0, 3).forEach(r => console.log(JSON.stringify(r, null, 2)));
    return;
  }

  // Upsert in batches of 100
  let inserted = 0, errors = [];
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await db.from('platform_members').upsert(batch, { onConflict: 'external_user_id' });
    if (error) errors.push(error.message);
    else inserted += batch.length;
  }

  console.log('\n✅ Upserted:', inserted, '| Errors:', errors.length);
  if (errors.length) errors.forEach(e => console.error('  Error:', e));
}

main().catch(console.error);
