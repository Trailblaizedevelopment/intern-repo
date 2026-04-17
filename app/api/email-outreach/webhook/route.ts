import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * POST /api/email-outreach/webhook
 * Receives SendGrid event webhooks.
 * Configure in SendGrid dashboard: Settings → Mail Settings → Event Webhook
 * URL: https://trailblaize.space/api/email-outreach/webhook
 *
 * Events handled:
 *   delivered, open, click, bounce, unsubscribe, spamreport
 */

interface SendGridEvent {
  event: string;
  email: string;
  timestamp: number;
  'smtp-id'?: string;
  sg_message_id?: string;
  sg_event_id?: string;
  sendId?: string;         // custom header X-Send-ID passed at send time
  campaignId?: string;     // custom header X-Campaign-ID
  type?: string;           // for bounces: 'bounce' | 'blocked'
  reason?: string;
  url?: string;
  // SendGrid unique_args / custom_args
  send_id?: string;
  campaign_id?: string;
}

export async function POST(request: NextRequest) {
  // Optionally verify SendGrid webhook signature here
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  let events: SendGridEvent[] = [];
  try {
    events = await request.json();
    if (!Array.isArray(events)) events = [events];
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  for (const event of events) {
    const sendId     = event.send_id || event.sendId;
    const campaignId = event.campaign_id || event.campaignId;
    const email      = event.email?.toLowerCase();
    const ts         = event.timestamp ? new Date(event.timestamp * 1000).toISOString() : new Date().toISOString();
    const sgMsgId    = event.sg_message_id;

    try {
      switch (event.event) {
        case 'delivered':
          if (sendId) {
            await supabase.from('email_sends')
              .update({ status: 'delivered', delivered_at: ts, sendgrid_message_id: sgMsgId || null })
              .eq('id', sendId);
          }
          if (campaignId) {
            await supabase.rpc('increment_campaign_stat', { campaign_id: campaignId, stat: 'delivered_count' });
          }
          break;

        case 'open':
          if (sendId) {
            await supabase.from('email_sends')
              .update({ status: 'opened', opened_at: ts })
              .eq('id', sendId)
              .is('opened_at', null); // only update first open
          }
          if (campaignId) {
            await supabase.rpc('increment_campaign_stat', { campaign_id: campaignId, stat: 'opened_count' });
          }
          break;

        case 'click':
          if (sendId) {
            await supabase.from('email_sends')
              .update({ status: 'clicked', first_clicked_at: ts })
              .eq('id', sendId)
              .is('first_clicked_at', null);
          }
          if (campaignId) {
            await supabase.rpc('increment_campaign_stat', { campaign_id: campaignId, stat: 'clicked_count' });
          }
          // Cross-check: if this email has signed up on the platform, mark them as signed_up
          if (email) {
            try {
              const { data: pmatch } = await supabase
                .from('platform_members')
                .select('id, chapter_id')
                .ilike('email', email)
                .limit(1);
              if (pmatch && pmatch.length > 0) {
                // Mark the alumni contact as signed_up
                await supabase
                  .from('alumni_contacts')
                  .update({ outreach_status: 'signed_up', signed_up_at: ts })
                  .ilike('email', email)
                  .neq('outreach_status', 'signed_up');
              }
            } catch { /* non-fatal */ }
          }
          break;

        case 'bounce':
        case 'blocked': {
          const bounceType = event.type === 'bounce' ? 'hard' : 'soft';
          if (sendId) {
            await supabase.from('email_sends')
              .update({ status: 'bounced', bounced_at: ts, bounce_type: bounceType, error_message: event.reason || null })
              .eq('id', sendId);
          }
          if (campaignId) {
            await supabase.rpc('increment_campaign_stat', { campaign_id: campaignId, stat: 'bounced_count' });
          }
          // Hard bounces: add to suppression list
          if (bounceType === 'hard' && email) {
            await supabase.from('email_unsubscribes')
              .upsert({ email, reason: `Hard bounce: ${event.reason || ''}` }, { onConflict: 'email', ignoreDuplicates: true });
          }
          break;
        }

        case 'unsubscribe':
        case 'group_unsubscribe':
          if (sendId) {
            await supabase.from('email_sends')
              .update({ status: 'unsubscribed', unsubscribed_at: ts })
              .eq('id', sendId);
          }
          if (email) {
            await supabase.from('email_unsubscribes')
              .upsert({ email, reason: 'User unsubscribed' }, { onConflict: 'email', ignoreDuplicates: true });
          }
          if (campaignId) {
            await supabase.rpc('increment_campaign_stat', { campaign_id: campaignId, stat: 'unsubscribed_count' });
          }
          break;

        case 'spamreport':
          if (email) {
            await supabase.from('email_unsubscribes')
              .upsert({ email, reason: 'Spam report' }, { onConflict: 'email', ignoreDuplicates: true });
          }
          break;
      }
    } catch (err) {
      console.error(`[webhook] error processing event ${event.event} for ${email}:`, err);
      // Don't fail entire batch — continue processing
    }
  }

  return NextResponse.json({ received: events.length });
}
