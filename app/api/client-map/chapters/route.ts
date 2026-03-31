// @ts-nocheck
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const getDB = () => getSupabaseAdmin()!;

// School name → state abbreviation lookup
// Matches on trimmed, lowercased, partial key
const SCHOOL_STATE_LOOKUP: Record<string, string> = {
  // Spec-required
  'university of alabama': 'AL',
  'ole miss': 'MS',
  'auburn': 'AL',
  'lsu': 'LA',
  'louisiana state university': 'LA',
  'texas a&m': 'TX',
  'university of texas': 'TX',
  'university of colorado boulder': 'CO',
  'university of colorado': 'CO',
  'chapman university': 'CA',
  'indiana university': 'IN',
  'miami university': 'OH',
  'clemson': 'SC',
  'tcu': 'TX',
  'texas christian university': 'TX',
  'villanova': 'PA',
  'brown': 'RI',
  'university of kansas': 'KS',
  'asu': 'AZ',
  'arizona state university': 'AZ',
  // Additional schools in DB
  'university of tennessee': 'TN',
  'university of mississippi': 'MS',
  'texas tech': 'TX',
  'texas tech university': 'TX',
  // More common Greek life schools
  'university of georgia': 'GA',
  'auburn university': 'AL',
  'university of florida': 'FL',
  'florida state university': 'FL',
  'ohio state university': 'OH',
  'university of michigan': 'MI',
  'michigan state university': 'MI',
  'penn state university': 'PA',
  'penn state': 'PA',
  'university of south carolina': 'SC',
  'university of kentucky': 'KY',
  'university of arkansas': 'AR',
  'vanderbilt university': 'TN',
  'vanderbilt': 'TN',
  'tulane university': 'LA',
  'tulane': 'LA',
  'university of missouri': 'MO',
  'mizzou': 'MO',
  'university of oklahoma': 'OK',
  'oklahoma state university': 'OK',
  'kansas state university': 'KS',
  'iowa state university': 'IA',
  'university of iowa': 'IA',
  'purdue university': 'IN',
  'purdue': 'IN',
  'notre dame': 'IN',
  'university of notre dame': 'IN',
  'duke university': 'NC',
  'duke': 'NC',
  'university of north carolina': 'NC',
  'wake forest university': 'NC',
  'north carolina state university': 'NC',
  'nc state': 'NC',
  'university of virginia': 'VA',
  'virginia tech': 'VA',
  'georgetown university': 'DC',
  'george washington university': 'DC',
  'american university': 'DC',
};

function deriveState(school: string): string {
  const key = school.trim().toLowerCase().replace(/\s+/g, ' ');
  // Exact match
  if (SCHOOL_STATE_LOOKUP[key]) return SCHOOL_STATE_LOOKUP[key];
  // Partial match — check if key contains a known pattern or vice versa
  for (const [pattern, state] of Object.entries(SCHOOL_STATE_LOOKUP)) {
    if (key.includes(pattern) || pattern.includes(key)) return state;
  }
  return 'US'; // Unknown
}

export async function GET() {
  // Query chapters table — active/on-map means status='active' OR onboarding_completed IS NOT NULL
  const { data, error } = await supabase
    .from('chapters')
    .select('id, chapter_name, school, mrr, status, onboarding_completed')
    .or('status.eq.active,onboarding_completed.not.is.null');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Shape for the map component: derive state and ARR
  const shaped = (data ?? []).map((row) => ({
    id: row.id,
    chapter_name: row.chapter_name,
    school: row.school,
    state: deriveState(row.school ?? ''),
    mrr: row.mrr ?? 0,
    arr: (row.mrr ?? 0) * 12,
    status: row.status,
    onboarding_completed: row.onboarding_completed,
  }));

  return NextResponse.json({ data: shaped });
}
