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

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    const offset = (page - 1) * limit;
    const optIn = searchParams.get('opt_in');
    const search = searchParams.get('search');
    const sort = searchParams.get('sort') || 'last_contact';

    let query = supabase
      .from('scout_profiles')
      .select('*', { count: 'exact' });

    if (optIn) {
      query = query.eq('opt_in_status', optIn);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,phone_number.ilike.%${search}%,university.ilike.%${search}%,chapter.ilike.%${search}%`);
    }

    const sortColumn = sort === 'name' ? 'name' : sort === 'completeness' ? 'profile_complete' : 'last_contact';
    const ascending = sort === 'name';
    query = query.order(sortColumn, { ascending, nullsFirst: false });
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[GET /api/scout/profiles] DB error:', error.message);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code || 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, total: count ?? 0, error: null });
  } catch (err) {
    console.error('[GET /api/scout/profiles] Unexpected error:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { source_type, source_id } = body;

    if (!source_type) {
      return NextResponse.json(
        { data: null, error: { message: 'source_type is required', code: 'MISSING_FIELDS' } },
        { status: 400 }
      );
    }

    let profileData: Record<string, unknown> = {};

    if (source_type === 'platform_profile' && source_id) {
      const platform = getPlatformAdmin();
      if (!platform) {
        return NextResponse.json(
          { data: null, error: { message: 'Platform not configured', code: 'PLATFORM_NOT_CONFIGURED' } },
          { status: 500 }
        );
      }

      const { data: profile, error: profileErr } = await platform
        .from('profiles')
        .select(
          'id, first_name, last_name, full_name, phone, email, chapter_id, grad_year, major, location, role, linkedin_url, member_status, bio, hometown, industry, company, job_title, current_place, spaces:chapter_id(id, name)'
        )
        .eq('id', source_id)
        .single();

      if (profileErr || !profile) {
        return NextResponse.json(
          { data: null, error: { message: 'Platform profile not found', code: 'NOT_FOUND' } },
          { status: 404 }
        );
      }

      const name = profile.full_name || [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Unknown';
      const phone = profile.phone;
      if (!phone) {
        return NextResponse.json(
          { data: null, error: { message: 'Platform profile has no phone number', code: 'VALIDATION_ERROR' } },
          { status: 400 }
        );
      }

      // Normalize phone to E.164 for consistent matching
      const phoneDigits = phone.replace(/\D/g, '');
      const normalizedPhone = phoneDigits.length === 10 ? `+1${phoneDigits}` : phoneDigits.length === 11 && phoneDigits.startsWith('1') ? `+${phoneDigits}` : phone.startsWith('+') ? phone : `+${phoneDigits}`;

      const space = (Array.isArray(profile.spaces) ? profile.spaces[0] : profile.spaces) as { id: string; name: string } | null;
      const membershipRoles = new Set(['alumni', 'alum', 'active', 'active_member', 'graduated', 'member', 'pledge', 'new_member']);
      const roleLabel = (profile.role || '').toLowerCase().replace(/\s+/g, '_');
      const jobTitle = profile.job_title || null;
      const currentTitle =
        jobTitle ||
        (profile.role && !membershipRoles.has(roleLabel) ? profile.role : null);

      const careerInterest =
        profile.industry ||
        (profile.major && String(profile.major).toLowerCase() !== 'to be updated' ? profile.major : null);

      profileData = {
        phone_number: normalizedPhone,
        name,
        chapter: space?.name || null,
        university: space?.name || null,
        graduation_year: profile.grad_year,
        location: profile.location || profile.current_place || null,
        current_title: currentTitle,
        career_interest: careerInterest,
        platform_chapter_id: profile.chapter_id || null,
        member_status: profile.member_status || null,
        industry: profile.industry || null,
        company: profile.company || null,
        job_title: jobTitle,
        hometown: profile.hometown || null,
        linkedin_url: profile.linkedin_url || null,
        bio: profile.bio || null,
        source_type: 'platform_profile',
        source_id,
        profile_complete: 30,
      };
    } else if (source_type === 'manual') {
      const { name, phone_number } = body;
      if (!name || !phone_number) {
        return NextResponse.json(
          { data: null, error: { message: 'name and phone_number are required for manual entry', code: 'MISSING_FIELDS' } },
          { status: 400 }
        );
      }
      profileData = {
        phone_number,
        name,
        chapter: body.chapter || null,
        university: body.university || null,
        graduation_year: body.graduation_year || null,
        location: body.location || null,
        current_title: body.current_title || null,
        career_interest: body.career_interest || null,
        goals: body.goals || [],
        skills: body.skills || [],
        looking_for: body.looking_for || null,
        notes: body.notes || '',
        source_type: 'manual',
        source_id: null,
        profile_complete: body.profile_complete || 10,
      };
    } else {
      return NextResponse.json(
        { data: null, error: { message: 'Invalid source_type or missing source_id', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('scout_profiles')
      .insert(profileData)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { data: null, error: { message: 'Profile with this phone number already exists', code: 'DUPLICATE' } },
          { status: 409 }
        );
      }
      console.error('[POST /api/scout/profiles] DB error:', error.message);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code || 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/scout/profiles] Unexpected error:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { data: null, error: { message: 'id is required', code: 'MISSING_FIELDS' } },
        { status: 400 }
      );
    }

    const allowedFields = [
      'name', 'chapter', 'university', 'graduation_year', 'location',
      'current_title', 'career_interest', 'goals', 'skills', 'looking_for',
      'opt_in_status', 'last_contact', 'next_followup', 'profile_complete', 'notes',
      'member_status', 'industry', 'company', 'job_title', 'hometown', 'linkedin_url', 'bio',
      'platform_chapter_id', 'conversation_stage',
    ];

    const sanitized: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of allowedFields) {
      if (key in updates) {
        sanitized[key] = updates[key];
      }
    }

    const { data, error } = await supabase
      .from('scout_profiles')
      .update(sanitized)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[PATCH /api/scout/profiles] DB error:', error.message);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code || 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('[PATCH /api/scout/profiles] Unexpected error:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
