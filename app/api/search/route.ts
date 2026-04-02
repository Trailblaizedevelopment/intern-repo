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

    supabase
      .from('deals')
      .select('id, name, stage, value, company')
      .or(`name.ilike.${pattern},company.ilike.${pattern}`)
      .limit(5),
  ]);

  const chapters = chaptersRes.status === 'fulfilled' ? (chaptersRes.value.data ?? []) : [];
  const contacts = contactsRes.status === 'fulfilled' ? (contactsRes.value.data ?? []) : [];
  const deals    = dealsRes.status    === 'fulfilled' ? (dealsRes.value.data    ?? []) : [];

  return NextResponse.json({ chapters, contacts, deals });
}
