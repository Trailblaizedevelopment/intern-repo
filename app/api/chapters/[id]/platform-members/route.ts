// GET /api/chapters/[id]/platform-members
// Returns active members from external Trailblaize platform for the given internal chapter ID
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { createClient } from '@supabase/supabase-js';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  // Find the platform_chapter_id for this internal chapter
  const { data: sample } = await supabase
    .from('alumni_contacts')
    .select('platform_chapter_id')
    .eq('chapter_id', params.id)
    .not('platform_chapter_id', 'is', null)
    .limit(1)
    .single();

  if (!sample?.platform_chapter_id) {
    return NextResponse.json({ members: [], platform_chapter_id: null });
  }

  // Fetch from external platform
  const platformUrl = process.env.PLATFORM_SUPABASE_URL;
  const platformKey = process.env.PLATFORM_SUPABASE_SERVICE_ROLE_KEY;
  if (!platformUrl || !platformKey) {
    return NextResponse.json({ error: 'Platform not configured' }, { status: 500 });
  }

  const platform = createClient(platformUrl, platformKey);
  const { data: members, error } = await platform
    .from('chapter_members_view')
    .select('id, full_name, first_name, last_name, role, grad_year, major, gpa, hometown, bio, phone, email, pledge_class, avatar_url')
    .eq('chapter_id', sample.platform_chapter_id)
    .eq('role', 'active_member')
    .order('last_name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ members: members || [], platform_chapter_id: sample.platform_chapter_id });
}
