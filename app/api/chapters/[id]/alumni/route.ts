// GET /api/chapters/[id]/alumni
// Merged view: internal alumni_contacts + external platform profiles
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getPlatformAdmin } from '@/lib/supabase-platform';

// ── Types ────────────────────────────────────────────────────────────────────

interface AlumniContact {
  id: string;
  chapter_id: string;
  first_name: string;
  last_name: string;
  phone_primary: string | null;
  email: string | null;
  outreach_status: string;
  touch1_sent_at: string | null;
  touch2_sent_at: string | null;
  touch3_sent_at: string | null;
  is_imessage: boolean | null;
  year: number | null;
  platform_chapter_id: string | null;
}

interface ExternalProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  grad_year: number | null;
  location: string | null;
  linkedin_url: string | null;
  chapter_id: string | null;
  role: string | null;
  member_status: string | null;
  last_active_at: string | null;
  last_login_at: string | null;
  bio: string | null;
  major: string | null;
  hometown: string | null;
}

export interface MergedAlumni {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  avatar_url: string | null;
  grad_year: number | null;
  location: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  outreach_status: string;
  platform_joined: boolean;
  last_active_at: string | null;
  member_status: string | null;
  engagement_score: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Normalize phone to last 10 digits for comparison */
function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return null;
}

function normalizeEmail(email: string | null): string | null {
  return email ? email.toLowerCase().trim() : null;
}

/** Engagement score 0-100 */
function calcEngagement(profile: ExternalProfile): number {
  let score = 0;
  if (profile.last_active_at) {
    const daysSince = (Date.now() - new Date(profile.last_active_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince <= 30) score += 40;
    else if (daysSince <= 90) score += 20;
  }
  if (profile.avatar_url) score += 10;
  if (profile.linkedin_url) score += 10;
  if (profile.bio) score += 10;
  if (profile.location) score += 10;
  return Math.min(score, 100);
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search')?.toLowerCase() || '';
  const statusFilter = searchParams.get('status') || 'all';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const sort = searchParams.get('sort') || 'engagement_score';

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'Internal DB not configured' }, { status: 500 });
  }

  // ── Step 1: Fetch all alumni_contacts for this chapter ────────────────────
  const { data: contacts, error: contactsError } = await supabase
    .from('alumni_contacts')
    .select(
      'id, chapter_id, first_name, last_name, phone_primary, email, outreach_status, ' +
      'touch1_sent_at, touch2_sent_at, touch3_sent_at, is_imessage, year, platform_chapter_id'
    )
    .eq('chapter_id', id)
    .limit(10000); // Supabase default row cap is 1000 — explicitly raise to 10000 for large chapters (2783+ contacts)

  if (contactsError) {
    return NextResponse.json({ error: contactsError.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allContacts: AlumniContact[] = ((contacts as any) || []) as AlumniContact[];

  // ── Step 2: Find the external chapter_id ─────────────────────────────────
  // Primary source: chapter_external_mappings table — this is the authoritative mapping.
  let externalChapterId: string | null = null;

  const { data: mapping } = await supabase
    .from('chapter_external_mappings')
    .select('external_chapter_id')
    .eq('internal_chapter_id', id)
    .single();

  if (mapping?.external_chapter_id) {
    externalChapterId = mapping.external_chapter_id;
  }

  // Fallback 1: check alumni_contacts for platform_chapter_id (populated by backfill)
  if (!externalChapterId) {
    for (const c of allContacts) {
      if (c.platform_chapter_id) {
        externalChapterId = c.platform_chapter_id;
        break;
      }
    }
  }

  // ── Step 3: Fetch external platform profiles ──────────────────────────────
  let externalProfiles: ExternalProfile[] = [];

  const platformClient = getPlatformAdmin();

  if (externalChapterId && platformClient) {
    const platform = platformClient;
    const { data: profiles } = await platform
      .from('profiles')
      .select(
        'id, email, full_name, first_name, last_name, phone, avatar_url, grad_year, ' +
        'location, linkedin_url, chapter_id, role, member_status, last_active_at, ' +
        'last_login_at, bio, major, hometown'
      )
      .eq('chapter_id', externalChapterId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    externalProfiles = ((profiles as any) || []) as ExternalProfile[];
  }

  // ── Step 4: Build lookup maps for merging ─────────────────────────────────
  const profileByPhone = new Map<string, ExternalProfile>();
  const profileByEmail = new Map<string, ExternalProfile>();

  for (const p of externalProfiles) {
    const phone = normalizePhone(p.phone);
    const email = normalizeEmail(p.email);
    if (phone) profileByPhone.set(phone, p);
    if (email) profileByEmail.set(email, p);
  }

  // Track which external profiles were matched (to avoid duplicate unmatched)
  const matchedProfileIds = new Set<string>();

  // ── Step 5: Merge ─────────────────────────────────────────────────────────
  const merged: MergedAlumni[] = allContacts.map((contact) => {
    const phone = normalizePhone(contact.phone_primary);
    const email = normalizeEmail(contact.email);

    let profile: ExternalProfile | undefined;
    if (phone) profile = profileByPhone.get(phone);
    if (!profile && email) profile = profileByEmail.get(email);

    if (profile) matchedProfileIds.add(profile.id);

    const fullName = profile?.full_name ||
      `${profile?.first_name || contact.first_name} ${profile?.last_name || contact.last_name}`.trim();

    return {
      id: contact.id,
      first_name: profile?.first_name || contact.first_name,
      last_name: profile?.last_name || contact.last_name,
      full_name: fullName || `${contact.first_name} ${contact.last_name}`.trim(),
      avatar_url: profile?.avatar_url || null,
      grad_year: profile?.grad_year ?? contact.year ?? null,
      location: profile?.location || null,
      email: contact.email || profile?.email || null,
      phone: contact.phone_primary || profile?.phone || null,
      linkedin_url: profile?.linkedin_url || null,
      outreach_status: contact.outreach_status,
      platform_joined: !!profile,
      last_active_at: profile?.last_active_at || null,
      member_status: profile?.member_status || null,
      engagement_score: profile ? calcEngagement(profile) : 0,
    };
  });

  // ── Step 5b: Add unmatched external profiles (signed up but not in outreach list) ──
  // These are alumni who joined the platform organically without being contacted via outreach.
  // They should always appear in the alumni view regardless of whether they're in the contact list.
  for (const profile of externalProfiles) {
    if (!matchedProfileIds.has(profile.id)) {
      merged.push({
        id: `platform-${profile.id}`,
        first_name: profile.first_name || profile.full_name?.split(' ')[0] || '',
        last_name: profile.last_name || profile.full_name?.split(' ').slice(1).join(' ') || '',
        full_name: profile.full_name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
        avatar_url: profile.avatar_url || null,
        grad_year: profile.grad_year ?? null,
        location: profile.location || null,
        email: profile.email || null,
        phone: profile.phone || null,
        linkedin_url: profile.linkedin_url || null,
        outreach_status: 'signed_up',
        platform_joined: true,
        last_active_at: profile.last_active_at || null,
        member_status: profile.member_status || null,
        engagement_score: calcEngagement(profile),
      });
    }
  }

  // ── Step 6: Apply filters ─────────────────────────────────────────────────
  let filtered = merged;

  if (search) {
    filtered = filtered.filter((m) => {
      const name = m.full_name.toLowerCase();
      const email = (m.email || '').toLowerCase();
      const phone = (m.phone || '').replace(/\D/g, '');
      return (
        name.includes(search) ||
        email.includes(search) ||
        phone.includes(search.replace(/\D/g, ''))
      );
    });
  }

  if (statusFilter !== 'all') {
    if (statusFilter === 'platform_joined') {
      filtered = filtered.filter((m) => m.platform_joined);
    } else if (statusFilter === 'not_joined') {
      filtered = filtered.filter((m) => !m.platform_joined);
    } else {
      filtered = filtered.filter((m) => m.outreach_status === statusFilter);
    }
  }

  // ── Step 7: Sort ─────────────────────────────────────────────────────────
  filtered.sort((a, b) => {
    switch (sort) {
      case 'grad_year':
        return (b.grad_year || 0) - (a.grad_year || 0);
      case 'name':
        return a.full_name.localeCompare(b.full_name);
      case 'last_active':
        return (
          new Date(b.last_active_at || 0).getTime() -
          new Date(a.last_active_at || 0).getTime()
        );
      case 'engagement_score':
      default:
        return b.engagement_score - a.engagement_score;
    }
  });

  // ── Step 8: Paginate ──────────────────────────────────────────────────────
  const total = filtered.length;
  const joined = merged.filter((m) => m.platform_joined).length;
  const notJoined = merged.length - joined;
  const paginated = filtered.slice((page - 1) * limit, page * limit);

  return NextResponse.json({
    members: paginated,
    total,
    joined,
    not_joined: notJoined,
    external_chapter_id: externalChapterId,
  });
}
