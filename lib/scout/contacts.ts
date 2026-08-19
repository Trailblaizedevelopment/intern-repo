import { createHash } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getPlatformAdmin } from '@/lib/supabase-platform';
import { emitActivationEvent, personaFromStatus } from '@/lib/scout/events';

export interface ContactMatchRow {
  id: string;
  display_name: string;
  matched_platform_profile_id: string | null;
  reachable_sms: boolean;
}

export interface IngestContact {
  name: string;
  phone?: string;
  email?: string;
  reachable_sms?: boolean;
}

export function normalizePhoneE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length >= 10) return `+${digits}`;
  return null;
}

export function phoneLast10(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

export function normalizeEmail(email: string): string | null {
  const v = email.trim().toLowerCase();
  if (!v || !v.includes('@')) return null;
  return v;
}

export function hashContactValue(value: string): string {
  return createHash('sha256').update(value.toLowerCase()).digest('hex');
}

export async function loadContactMatches(memberId: string): Promise<ContactMatchRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('scout_contact_matches')
    .select('id, display_name, matched_platform_profile_id, reachable_sms')
    .eq('member_id', memberId)
    .limit(200);
  if (error) {
    console.error('[scout/contacts] load matches failed:', error.message);
    return [];
  }
  return (data || []) as ContactMatchRow[];
}

export async function memberHasContactMatches(memberId: string): Promise<boolean> {
  const matches = await loadContactMatches(memberId);
  return matches.some(m => Boolean(m.matched_platform_profile_id));
}

interface PlatformRosterRow {
  id: string;
  phone: string | null;
  email: string | null;
}

async function loadChapterRoster(chapterId: string): Promise<PlatformRosterRow[]> {
  const platform = getPlatformAdmin();
  if (!platform) return [];
  const { data, error } = await platform
    .from('profiles')
    .select('id, phone, email')
    .eq('chapter_id', chapterId)
    .limit(500);
  if (error) {
    console.error('[scout/contacts] roster load failed:', error.message);
    return [];
  }
  return (data || []) as PlatformRosterRow[];
}

export async function ingestContactMatches(opts: {
  memberId: string;
  scope: 'selective' | 'full';
  contacts: IngestContact[];
}): Promise<{
  grant_id: string;
  matched: number;
  unmatched: number;
  invites_suggested: number;
}> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('db_not_configured');

  const { data: profile, error: profileErr } = await supabase
    .from('scout_profiles')
    .select('id, platform_chapter_id, industry, location, member_status')
    .eq('id', opts.memberId)
    .single();
  if (profileErr || !profile) throw new Error('profile_not_found');

  const { data: grant, error: grantErr } = await supabase
    .from('scout_contact_grants')
    .insert({
      member_id: opts.memberId,
      scope: opts.scope,
      contact_count: opts.contacts.length,
    })
    .select('id')
    .single();
  if (grantErr || !grant) throw new Error(grantErr?.message || 'grant_insert_failed');

  const roster = profile.platform_chapter_id
    ? await loadChapterRoster(profile.platform_chapter_id as string)
    : [];
  const byPhone = new Map<string, string>();
  const byEmail = new Map<string, string>();
  for (const row of roster) {
    if (row.phone) {
      const last10 = phoneLast10(row.phone);
      if (last10) byPhone.set(last10, row.id);
    }
    if (row.email) {
      const email = normalizeEmail(row.email);
      if (email) byEmail.set(email, row.id);
    }
  }

  let matched = 0;
  let unmatched = 0;
  let invites = 0;

  for (const contact of opts.contacts.slice(0, 500)) {
    const name = (contact.name || '').trim();
    if (!name) continue;
    const e164 = contact.phone ? normalizePhoneE164(contact.phone) : null;
    const last10 = contact.phone ? phoneLast10(contact.phone) : null;
    const email = contact.email ? normalizeEmail(contact.email) : null;
    const phoneHash = e164 ? hashContactValue(e164) : null;
    const emailHash = email ? hashContactValue(email) : null;
    const platformId = (last10 && byPhone.get(last10)) || (email && byEmail.get(email)) || null;
    const reachable = Boolean(contact.reachable_sms ?? e164);

    const row = {
      member_id: opts.memberId,
      grant_id: grant.id as string,
      display_name: name.slice(0, 120),
      phone_hash: phoneHash,
      email_hash: emailHash,
      phone_e164: e164,
      matched_platform_profile_id: platformId,
      reachable_sms: reachable,
      updated_at: new Date().toISOString(),
    };

    let matchId: string | null = null;
    if (phoneHash) {
      const { data: existing } = await supabase
        .from('scout_contact_matches')
        .select('id')
        .eq('member_id', opts.memberId)
        .eq('phone_hash', phoneHash)
        .maybeSingle();
      matchId = (existing?.id as string) || null;
    } else if (emailHash) {
      const { data: existing } = await supabase
        .from('scout_contact_matches')
        .select('id')
        .eq('member_id', opts.memberId)
        .eq('email_hash', emailHash)
        .maybeSingle();
      matchId = (existing?.id as string) || null;
    }

    if (matchId) {
      const { error } = await supabase.from('scout_contact_matches').update(row).eq('id', matchId);
      if (error) {
        console.error('[scout/contacts] update failed:', error.message);
        continue;
      }
    } else {
      const { data: inserted, error } = await supabase
        .from('scout_contact_matches')
        .insert(row)
        .select('id')
        .single();
      if (error) {
        console.error('[scout/contacts] insert failed:', error.message);
        continue;
      }
      matchId = (inserted?.id as string) || null;
    }

    if (platformId) {
      matched += 1;
    } else {
      unmatched += 1;
      await supabase.from('scout_invite_suggestions').insert({
        member_id: opts.memberId,
        contact_match_id: matchId,
        display_name: name.slice(0, 120),
        status: 'pending',
      });
      await emitActivationEvent({
        memberId: opts.memberId,
        type: 'invite_suggested',
        communityId: (profile.platform_chapter_id as string) || null,
        industry: profile.industry,
        geo: profile.location,
        persona: personaFromStatus(profile.member_status),
      });
      invites += 1;
    }
  }

  return {
    grant_id: grant.id as string,
    matched,
    unmatched,
    invites_suggested: invites,
  };
}
