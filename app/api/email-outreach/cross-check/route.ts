import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * POST /api/email-outreach/cross-check
 * Cross-references platform_members against alumni_contacts by email.
 * Marks any alumni who have signed up on the platform as outreach_status='signed_up'.
 * Run daily or trigger manually after a campaign send.
 */
export async function POST() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  try {
    // Get all platform members with emails
    const { data: members, error: membersErr } = await supabase
      .from('platform_members')
      .select('email, chapter_id')
      .not('email', 'is', null)
      .neq('email', '');

    if (membersErr) throw membersErr;
    if (!members || members.length === 0) {
      return NextResponse.json({ updated: 0, message: 'No platform members found' });
    }

    const emails = members.map(m => m.email.toLowerCase()).filter(Boolean);
    let updated = 0;

    // Batch update alumni_contacts where email matches a platform member
    // Do in chunks of 100 to avoid query limits
    const CHUNK = 100;
    for (let i = 0; i < emails.length; i += CHUNK) {
      const chunk = emails.slice(i, i + CHUNK);
      const { data, error } = await supabase
        .from('alumni_contacts')
        .update({ outreach_status: 'signed_up' })
        .in('email', chunk)
        .neq('outreach_status', 'signed_up')
        .not('email', 'is', null);
      
      if (!error && data) updated += (data as unknown[]).length;
    }

    return NextResponse.json({ 
      updated, 
      total_members: members.length,
      message: `Marked ${updated} alumni contacts as signed_up` 
    });
  } catch (err) {
    console.error('[email-outreach/cross-check]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
