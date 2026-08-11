import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getPlatformAdmin } from '@/lib/supabase-platform';

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } },
        { status: 500 }
      );
    }

    const platform = getPlatformAdmin();
    if (!platform) {
      return NextResponse.json(
        { data: null, error: { message: 'Platform not configured', code: 'PLATFORM_NOT_CONFIGURED' } },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')));

    if (!q || q.length < 2) {
      return NextResponse.json({ data: [], error: null });
    }

    // Get phone numbers already in scout_profiles to exclude them
    const { data: existingProfiles } = await supabase
      .from('scout_profiles')
      .select('phone_number, source_id');

    const existingPhones = new Set((existingProfiles || []).map(p => p.phone_number));
    const existingSourceIds = new Set(
      (existingProfiles || []).filter(p => p.source_id).map(p => p.source_id)
    );

    // Search the external Trailblaize platform profiles table, joining spaces for chapter name
    const { data: profiles, error: platformErr } = await platform
      .from('profiles')
      .select('id, first_name, last_name, full_name, phone, email, chapter_id, grad_year, major, location, role, spaces:chapter_id(id, name)')
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(limit * 2);

    if (platformErr) {
      console.error('[GET /api/scout/profiles/search] Platform query error:', platformErr.message);
      return NextResponse.json(
        { data: null, error: { message: 'Failed to query platform', code: 'PLATFORM_ERROR' } },
        { status: 500 }
      );
    }

    const results: Array<{
      id: string;
      name: string;
      phone: string | null;
      source_type: 'platform_profile';
      university: string | null;
      chapter: string | null;
      location: string | null;
      role: string | null;
      grad_year: number | string | null;
      major: string | null;
    }> = [];

    if (profiles) {
      for (const p of profiles) {
        if (p.phone && existingPhones.has(p.phone)) continue;
        if (existingSourceIds.has(p.id)) continue;

        const space = p.spaces as { id: string; name: string } | null;
        const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown';

        results.push({
          id: p.id,
          name,
          phone: p.phone,
          source_type: 'platform_profile',
          university: space?.name || null,
          chapter: space?.name || null,
          location: p.location || null,
          role: p.role || null,
          grad_year: p.grad_year || null,
          major: p.major || null,
        });
      }
    }

    // Filter out entries without a phone (can't message them)
    const withPhone = results.filter(r => r.phone).slice(0, limit);

    return NextResponse.json({ data: withPhone, error: null });
  } catch (err) {
    console.error('[GET /api/scout/profiles/search] Unexpected error:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
