import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/email-outreach/unsubscribe?sid=<send_id>
 * One-click unsubscribe landing page redirect.
 * Updates email_sends + adds to email_unsubscribes.
 */
export async function GET(request: NextRequest) {
  const sendId = request.nextUrl.searchParams.get('sid');
  const supabase = getSupabaseAdmin();

  if (sendId && supabase) {
    const { data: send } = await supabase
      .from('email_sends')
      .select('email, campaign_id')
      .eq('id', sendId)
      .single();

    if (send?.email) {
      await supabase.from('email_sends')
        .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() })
        .eq('id', sendId);

      await supabase.from('email_unsubscribes')
        .upsert({ email: send.email.toLowerCase(), reason: 'One-click unsubscribe' }, { onConflict: 'email', ignoreDuplicates: true });

      if (send.campaign_id) {
        await supabase.rpc('increment_campaign_stat', {
          campaign_id: send.campaign_id,
          stat: 'unsubscribed_count',
        });
      }
    }
  }

  // Redirect to a simple confirmation page
  return NextResponse.redirect(
    new URL('/unsubscribed', request.url),
    { status: 302 },
  );
}
