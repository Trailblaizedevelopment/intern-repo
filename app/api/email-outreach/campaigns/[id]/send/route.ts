import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmailBatch, interpolate, BatchRecipient } from '@/lib/sendgrid';

/**
 * POST /api/email-outreach/campaigns/[id]/send
 * Sends a campaign via SendGrid. alumni_contacts + all tables are on the internal DB.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const { data: campaign, error: campErr } = await supabase
    .from('email_campaigns')
    .select('*')
    .eq('id', id)
    .single();

  if (campErr || !campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  if (campaign.status === 'sent') return NextResponse.json({ error: 'Campaign already sent' }, { status: 400 });
  if (campaign.status === 'sending') return NextResponse.json({ error: 'Campaign is already sending' }, { status: 400 });

  await supabase.from('email_campaigns').update({ status: 'sending' }).eq('id', id);

  try {
    // Suppression list
    const { data: unsubs } = await supabase.from('email_unsubscribes').select('email');
    const { data: hardBounces } = await supabase.from('email_sends').select('email').eq('bounce_type', 'hard');
    const suppressed = new Set([
      ...(unsubs || []).map(u => u.email.toLowerCase()),
      ...(hardBounces || []).map(b => b.email.toLowerCase()),
    ]);

    // Load alumni contacts (internal DB)
    const { data: contacts, error: contErr } = await supabase
      .from('alumni_contacts')
      .select('id, first_name, last_name, email, year')
      .eq('chapter_id', campaign.chapter_id)
      .not('email', 'is', null)
      .neq('email', '');

    if (contErr) throw new Error(`Failed to load contacts: ${contErr.message}`);

    const eligible = (contacts || []).filter(c => c.email && !suppressed.has(c.email.toLowerCase()));

    if (eligible.length === 0) {
      await supabase.from('email_campaigns').update({ status: 'sent', sent_at: new Date().toISOString(), sent_count: 0 }).eq('id', id);
      return NextResponse.json({ data: { sent: 0, failed: 0, message: 'No eligible contacts' }, error: null });
    }

    // Create pending send records
    const sendRows = eligible.map(c => ({
      campaign_id: id,
      contact_id: c.id,
      email: c.email,
      first_name: c.first_name || '',
      last_name: c.last_name || '',
      grad_year: (c as unknown as { year?: number | null }).year || null,
      status: 'pending',
    }));

    const { data: insertedSends, error: insErr } = await supabase
      .from('email_sends')
      .insert(sendRows)
      .select('id, email, first_name, last_name');

    if (insErr) throw new Error(`Failed to create send records: ${insErr.message}`);

    // Build recipients with interpolated template
    const chapterName = campaign.chapter_name || '';
    const recipients: BatchRecipient[] = (insertedSends || []).map(send => {
      const vars: Record<string, string> = {
        first_name: send.first_name || '',
        last_name: send.last_name || '',
        chapter: chapterName,
      };
      return {
        sendId: send.id,
        email: send.email,
        name: `${send.first_name || ''} ${send.last_name || ''}`.trim(),
        subject: interpolate(campaign.subject_line, vars),
        htmlBody: interpolate(campaign.template_html, vars),
      };
    });

    // Send
    const results = await sendEmailBatch(recipients, id);

    // Mark sent records
    const sentIds = (insertedSends || []).map(s => s.id);
    if (sentIds.length > 0) {
      await supabase.from('email_sends').update({ status: 'sent', sent_at: new Date().toISOString() }).in('id', sentIds);
    }

    // Compute next touch date
    const now = new Date();
    let nextTouchEligibleAt: string | null = null;
    if (campaign.touch_number < 3) {
      const next = new Date(now);
      next.setDate(next.getDate() + (campaign.touch_number === 1 ? 5 : 8));
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
      data: { sent: results.sent, failed: results.failed, errors: results.errors.slice(0, 10), next_touch_eligible_at: nextTouchEligibleAt },
      error: null,
    });

  } catch (err) {
    await supabase.from('email_campaigns').update({ status: 'draft' }).eq('id', id);
    console.error('[email-outreach/send]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
