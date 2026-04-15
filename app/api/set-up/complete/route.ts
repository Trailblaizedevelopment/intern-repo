import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/sendgrid';

export const runtime = 'nodejs';

/**
 * POST /api/set-up/complete
 * Called after Stripe Checkout succeeds.
 * 1. Retrieves the Stripe session + metadata
 * 2. Creates a chapter in Supabase
 * 3. Updates pipeline deal to closed_won if a match is found
 * 4. Sends email notifications to Owen, Ford, Adam
 */
export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json() as { sessionId: string };

    if (!sessionId) {
      return NextResponse.json({ error: 'session_id is required' }, { status: 400 });
    }

    // 1. Retrieve Stripe session
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });

    if (!session || session.payment_status === 'unpaid') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 400 });
    }

    const meta = session.metadata || {};
    const orgName = meta.orgName || '';
    const school = meta.school || '';
    const orgType = meta.orgType || '';
    const memberCount = Number(meta.memberCount) || 0;
    const leaderName = meta.leaderName || '';
    const leaderEmail = meta.leaderEmail || '';
    const leaderPhone = meta.leaderPhone || '';
    const instagramHandle = meta.instagramHandle || null;
    const designation = meta.designation || null;
    const pricePerMonth = Number(meta.pricePerMonth) || 0;
    const agreedName = meta.agreedName || '';
    const agreedAt = meta.agreedAt || new Date().toISOString();

    const stripeCustomerId =
      typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;

    const stripeSubscriptionId =
      session.subscription
        ? typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription.id
        : null;

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });
    }

    // 2. Create chapter in Supabase
    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .insert({
        chapter_name: designation
          ? `${orgName} ${designation}`
          : orgName,
        school,
        fraternity: orgName,
        contact_name: leaderName,
        contact_email: leaderEmail,
        contact_phone: leaderPhone,
        status: 'active',
        health: 'good',
        mrr: pricePerMonth,
        payment_type: 'monthly',
        payment_amount: pricePerMonth,
        member_count: memberCount,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        invoice_status: 'paid',
        invoice_paid_at: new Date().toISOString(),
        instagram_handle: instagramHandle,
        chapter_designation: designation,
        contract_status: 'signed',
        contract_signed_at: agreedAt,
        // Store signature info in notes field since contract_signed column doesn't exist in DB
        notes: `Signed digitally by ${agreedName} at ${agreedAt}. Org type: ${orgType}.`,
        chapter_created: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (chapterError) {
      console.error('[set-up/complete] chapter insert error:', chapterError);
      return NextResponse.json({ error: chapterError.message }, { status: 500 });
    }

    const chapterId = chapter.id;

    // 3. Update pipeline deal to closed_won if a match exists
    try {
      // Search pipeline_deals joined with organizations for a name match
      const { data: deals } = await supabase
        .from('pipeline_deals')
        .select('id, organization:organizations(name, school:schools(name))')
        .neq('stage', 'closed_won')
        .neq('stage', 'closed_lost')
        .limit(50);

      if (deals && deals.length > 0) {
        const orgNameLower = orgName.toLowerCase();
        const schoolLower = school.toLowerCase();
        const best = deals.find((d: any) => {
          const oName = d.organization?.name?.toLowerCase() ?? '';
          const sName = d.organization?.school?.name?.toLowerCase() ?? '';
          return oName.includes(orgNameLower) || sName.includes(schoolLower);
        });

        if (best) {
          await supabase
            .from('pipeline_deals')
            .update({ stage: 'closed_won', updated_at: new Date().toISOString() })
            .eq('id', best.id);
          console.log(`[set-up/complete] Deal ${best.id} updated to closed_won`);
        }
      }
    } catch (dealErr) {
      // Non-fatal — log but continue
      console.warn('[set-up/complete] deal update failed:', dealErr);
    }

    // 4. Send email notifications to Owen, Ford, Adam
    const notificationMessage = `🎉 ${orgName} at ${school} just signed up — ${memberCount} members — $${pricePerMonth}/mo. Make the launch post!`;

    const notifyTargets = [
      { email: 'owen@trailblaize.net', name: 'Owen' },
      { email: 'ford@trailblaize.net', name: 'Ford' },
      { email: 'adam@trailblaize.net', name: 'Adam' },
    ];

    await Promise.allSettled(
      notifyTargets.map((target) =>
        sendEmail({
          to: target.email,
          toName: target.name,
          subject: `🎉 New signup: ${orgName} at ${school}`,
          htmlBody: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
              <h2 style="color:#1B2A4A;margin-bottom:8px;">New chapter signed up!</h2>
              <p style="font-size:18px;color:#333;margin:16px 0;">${notificationMessage}</p>
              <table style="width:100%;border-collapse:collapse;margin:24px 0;">
                <tr><td style="padding:8px 0;color:#666;width:140px;">Organization</td><td style="padding:8px 0;font-weight:600;color:#1B2A4A;">${orgName}</td></tr>
                <tr><td style="padding:8px 0;color:#666;">School</td><td style="padding:8px 0;font-weight:600;color:#1B2A4A;">${school}</td></tr>
                <tr><td style="padding:8px 0;color:#666;">Type</td><td style="padding:8px 0;color:#333;">${orgType}</td></tr>
                <tr><td style="padding:8px 0;color:#666;">Designation</td><td style="padding:8px 0;color:#333;">${designation || '—'}</td></tr>
                <tr><td style="padding:8px 0;color:#666;">Members</td><td style="padding:8px 0;color:#333;">${memberCount}</td></tr>
                <tr><td style="padding:8px 0;color:#666;">MRR</td><td style="padding:8px 0;font-weight:600;color:#C4874A;">$${pricePerMonth}/mo</td></tr>
                <tr><td style="padding:8px 0;color:#666;">Leader</td><td style="padding:8px 0;color:#333;">${leaderName} · ${leaderEmail} · ${leaderPhone}</td></tr>
                ${instagramHandle ? `<tr><td style="padding:8px 0;color:#666;">Instagram</td><td style="padding:8px 0;color:#333;">@${instagramHandle}</td></tr>` : ''}
              </table>
              <a href="https://trailblaize.space/dashboard" style="display:inline-block;background:#1B2A4A;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:8px;">View in Nucleus →</a>
            </div>
          `,
        }),
      ),
    );

    return NextResponse.json({
      success: true,
      chapterId,
      loginUrl: 'https://trailblaize.space/login',
    });
  } catch (err: unknown) {
    console.error('[set-up/complete] error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
