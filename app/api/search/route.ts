import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/search?q=<query>
 *
 * Global search across chapters, alumni_contacts, and deals.
 * Returns up to 5 results per category.
 * Protected by middleware (Authorization: Bearer <internal_token>).
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';

  if (!q || q.length < 2) {
    return NextResponse.json({ chapters: [], contacts: [], deals: [] });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 500 });
  }

  const pattern = `%${q}%`;

  const [chaptersRes, contactsRes, dealsRes] = await Promise.allSettled([
    supabase
      .from('chapters')
      .select('id, chapter_name, school, fraternity, status')
      .or(`chapter_name.ilike.${pattern},school.ilike.${pattern},fraternity.ilike.${pattern}`)
      .limit(5),

    supabase
      .from('alumni_contacts')
      .select('id, first_name, last_name, phone_primary, chapter_id, chapter_name:chapters(chapter_name)')
      .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},phone_primary.ilike.${pattern}`)
      .limit(5),

    // Pull a broader set and post-filter by org name (joined fields can't be .or'd)
    supabase
      .from('pipeline_deals')
      .select('id, stage, value, notes, conference, organization:organizations(name)')
      .limit(100),
  ]);

  const chapters = chaptersRes.status === 'fulfilled' ? (chaptersRes.value.data ?? []) : [];
  const contacts = contactsRes.status === 'fulfilled' ? (contactsRes.value.data ?? []) : [];
  // Normalize pipeline_deals rows to the shape expected by GlobalSearch.
  // Post-filter so org name, conference, and notes all participate in search.
  const rawDeals = dealsRes.status === 'fulfilled' ? (dealsRes.value.data ?? []) : [];
  const qLower = q.toLowerCase();
  const deals = rawDeals
    .filter((d: Record<string, unknown>) => {
      const orgName = ((d.organization as { name?: string } | null)?.name ?? '').toLowerCase();
      const notes   = ((d.notes   as string | null) ?? '').toLowerCase();
      const conf    = ((d.conference as string | null) ?? '').toLowerCase();
      return orgName.includes(qLower) || notes.includes(qLower) || conf.includes(qLower);
    })
    .slice(0, 5)
    .map((d: Record<string, unknown>) => ({
      id: d.id,
      name: (d.organization as { name?: string } | null)?.name ?? null,
      stage: d.stage ?? null,
      value: d.value ?? null,
      company: (d.conference as string | null) ?? null,
    }));

  return NextResponse.json({ chapters, contacts, deals });
}
