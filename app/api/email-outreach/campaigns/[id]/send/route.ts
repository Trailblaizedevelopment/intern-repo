import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getPlatformAdmin } from '@/lib/supabase-platform';
import { sendEmailBatch, interpolate, BatchRecipient } from '@/lib/sendgrid';

/**
 * POST /api/email-outreach/campaigns/[id]/send
 * Executes the email send for a campaign.
 * - Pulls eligible alumni contacts from external platform DB
 * - Filters out unsubscribes + hard bounces
 * - Interpolates template vars per contact
 * - Sends via SendGrid in batches of 100
 * - Records every send in email_sends table
 * - Updates campaign status + stats
 */

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const platform = getPlatformAdmin();

  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });
  if (!platform) return NextResponse.json({ error: 'Platform DB not configured' }, { status: 500 });

  // 1. Fetch campaign
  const { data: campaign, error: campErr } = await supabase
    .from('email_campaigns')
    .select('*')
    .eq('id', id)
    .single();

  if (campErr || !campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  if (campaign.status === 'sent') return NextResponse.json({ error: 'Campaign already sent' }, { status: 400 });
  if (campaign.status === 'sending') return NextResponse.json({ error: 'Campaign is already sending' }, { status: 400 });

  // 2. Mark as sending
  await supabase.from('email_campaigns').update({ status: 'sending' }).eq('id', id);

  try {
    // 3. Load suppression list (unsubscribes + hard bounces from our DB)
    const { data: unsubs } = await supabase
      .from('email_unsubscribes').select('email');
    const { data: hardBounces } = await supabase
      .from('email_sends')
      .select('email')
      .eq('bounce_type', 'hard');

    const suppressedEmails = new Set([
      ...(unsubs || []).map(u => u.email.toLowerCase()),
      ...(hardBounces || []).map(b => b.email.toLowerCase()),
    ]);

    // 4. Pull alumni contacts from external platform
    const { data: contacts, error: contErr } = await platform
      .from('alumni_contacts')
      .select('id, first_name, last_name, email, grad_year')
      .eq('chapter_id', campaign.chapter_id)
      .not('email', 'is', null)
      .neq('email', '');

    if (contErr) throw new Error(`Failed to load contacts: ${contErr.message}`);

    // 5. Filter suppressed
    const eligible = (contacts || []).filter(
      c => c.email && !suppressedEmails.has(c.email.toLowerCase()),
    );

    if (eligible.length === 0) {
      await supabase.from('email_campaigns').update({ status: 'sent', sent_at: new Date().toISOString(), sent_count: 0 }).eq('id', id);
      return NextResponse.json({ data: { sent: 0, failed: 0, message: 'No eligible contacts' }, error: null });
    }

    // 6. Create email_sends records (pending)
    const sendRows = eligible.map(c => ({
      campaign_id: id,
      contact_id: c.id,
      email: c.email,
      first_name: c.first_name || '',
      last_name: c.last_name || '',
      grad_year: c.grad_year || null,
      status: 'pending',
    }));

    const { data: insertedSends, error: inserErr } = await supabase
      .from('email_sends')
      .insert(sendRows)
      .select('id, email, first_name, last_name');

    if (inserErr) throw new Error(`Failed to create send records: ${inserErr.message}`);

    // 7. Build batch recipients with interpolated content
    const chapterName = campaign.chapter_name || '';
    const recipients: BatchRecipient[] = (insertedSends || []).map(send => {
      const vars: Record<string, string> = {
        first_name: send.first_name || '',
        last_name:  send.last_name  || '',
        chapter:    chapterName,
      };
      return {
        sendId:   send.id,
        email:    send.email,
        name:     `${send.first_name || ''} ${send.last_name || ''}`.trim(),
        subject:  interpolate(campaign.subject_line, vars),
        htmlBody: interpolate(campaign.template_html, vars),
      };
    });

    // 8. Send via SendGrid
    const results = await sendEmailBatch(recipients, id);

    // 9. Update send records to 'sent'
    const sentIds = (insertedSends || []).map(s => s.id);
    if (sentIds.length > 0) {
      await supabase
        .from('email_sends')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .in('id', sentIds);
    }

    // 10. Update campaign
    const now = new Date();
    let nextTouchEligibleAt: string | null = null;
    if (campaign.touch_number < 3) {
      const daysUntilNext = campaign.touch_number === 1 ? 5 : 8;
      const next = new Date(now);
      next.setDate(next.getDate() + daysUntilNext);
      nextTouchEligibleAt = next.toISOString();
    }

    await supabase.from('email_campaigns').update({
      status: 'sent',
      sent_at: now.toISOString(),
      sent_count: results.sent,
      failed_count: results.failed,
      total_contacts: eligible.length,
      next_touch_eligible_at: nextTouchEligibleAt,
      updated_at: now.toISOString(),
    }).eq('id', id);

    return NextResponse.json({
      data: {
        sent: results.sent,
        failed: results.failed,
        errors: results.errors.slice(0, 10), // cap error list
        next_touch_eligible_at: nextTouchEligibleAt,
      },
      error: null,
    });

  } catch (err) {
    // Roll back to draft on failure
    await supabase.from('email_campaigns').update({ status: 'draft' }).eq('id', id);
    console.error('[email-outreach/send]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
