import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/sendgrid';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = await req.json() as Record<string, any>;
    const { sessionId, bypass } = body;

    let orgName = '', school = '', orgType = '', memberCount = 0, leaderName = '',
        leaderEmail = '', leaderPhone = '', instagramHandle: string | null = null,
        designation: string | null = null, pricePerMonth = 0, agreedName = '',
        agreedAt = new Date().toISOString(),
        stripeCustomerId: string | null = null, stripeSubscriptionId: string | null = null;

    if (bypass) {
      // Internal bypass code — no Stripe session needed
      orgName = body.orgName || ''; school = body.school || ''; orgType = body.orgType || '';
      memberCount = Number(body.memberCount) || 0; leaderName = body.leaderName || '';
      leaderEmail = body.leaderEmail || ''; leaderPhone = body.leaderPhone || '';
      instagramHandle = body.instagramHandle || null; designation = body.designation || null;
      pricePerMonth = Number(body.pricePerMonth) || 0;
      agreedName = body.agreedName || ''; agreedAt = body.agreedAt || agreedAt;
    } else {
      if (!sessionId) return NextResponse.json({ error: 'session_id is required' }, { status: 400 });
      const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] });
      if (!session || session.payment_status === 'unpaid') {
        return NextResponse.json({ error: 'Payment not completed' }, { status: 400 });
      }
      const meta = session.metadata || {};
      orgName = meta.orgName || ''; school = meta.school || ''; orgType = meta.orgType || '';
      memberCount = Number(meta.memberCount) || 0; leaderName = meta.leaderName || '';
      leaderEmail = meta.leaderEmail || ''; leaderPhone = meta.leaderPhone || '';
      instagramHandle = meta.instagramHandle || null; designation = meta.designation || null;
      pricePerMonth = Number(meta.pricePerMonth) || 0;
      agreedName = meta.agreedName || ''; agreedAt = meta.agreedAt || agreedAt;
      stripeCustomerId = typeof session.customer === 'string' ? session.customer : (session.customer as any)?.id ?? null;
      stripeSubscriptionId = session.subscription
        ? (typeof session.subscription === 'string' ? session.subscription : (session.subscription as any).id)
        : null;
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });

    // Create chapter
    const { data: chapter, error: chapterError } = await supabase
      .from('chapters')
      .insert({
        chapter_name: designation ? `${orgName} ${designation}` : orgName,
        school, fraternity: orgName,
        contact_name: leaderName, contact_email: leaderEmail, contact_phone: leaderPhone,
        status: 'active', health: 'good',
        mrr: pricePerMonth, payment_type: 'monthly', payment_amount: pricePerMonth,
        member_count: memberCount,
        stripe_customer_id: stripeCustomerId, stripe_subscription_id: stripeSubscriptionId,
        invoice_status: bypass ? 'not_sent' : 'paid',
        invoice_paid_at: bypass ? null : new Date().toISOString(),
        instagram_handle: instagramHandle, chapter_designation: designation,
        contract_status: 'signed', contract_signed_at: agreedAt,
        notes: `Signed digitally by ${agreedName} at ${agreedAt}. Org type: ${orgType}.${bypass ? ' [Internal bypass]' : ''}`,
        chapter_created: true,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      })
      .select('id').single();

    if (chapterError) {
      console.error('[set-up/complete] chapter insert error:', chapterError);
      return NextResponse.json({ error: chapterError.message }, { status: 500 });
    }

    const chapterId = chapter.id;

    // Update pipeline deal to closed_won
    try {
      const { data: deals } = await supabase
        .from('pipeline_deals')
        .select('id, organization:organizations(name, school:schools(name))')
        .neq('stage', 'closed_won').neq('stage', 'closed_lost').limit(50);
      if (deals?.length) {
        const best = deals.find((d: any) => {
          const oName = d.organization?.name?.toLowerCase() ?? '';
          const sName = d.organization?.school?.name?.toLowerCase() ?? '';
          return oName.includes(orgName.toLowerCase()) || sName.includes(school.toLowerCase());
        });
        if (best) {
          await supabase.from('pipeline_deals').update({ stage: 'closed_won', updated_at: new Date().toISOString() }).eq('id', best.id);
        }
      }
    } catch (e) { console.warn('[set-up/complete] deal update failed:', e); }

    // Send confirmation email to the signer with agreement summary (no DocuSign needed)
    try {
      await sendEmail({
        to: leaderEmail,
        toName: leaderName,
        subject: 'Your Trailblaize Agreement — Welcome!',
        htmlBody: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
            <img src="https://trailblaize.space/logos/logo-wordmark-navy.png" alt="Trailblaize" style="height:28px;margin-bottom:24px;" />
            <h2 style="color:#111827;margin-bottom:8px;">You're all set, ${leaderName}!</h2>
            <p style="color:#374151;">Your agreement has been signed and your account is being created.</p>
            <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:12px;padding:16px 20px;margin:20px 0;">
              <p style="margin:0 0 8px 0;font-size:0.875rem;color:#374151;"><strong>Organization:</strong> ${orgName}</p>
              <p style="margin:0 0 8px 0;font-size:0.875rem;color:#374151;"><strong>School:</strong> ${school}</p>
              <p style="margin:0 0 8px 0;font-size:0.875rem;color:#374151;"><strong>Monthly Plan:</strong> $${pricePerMonth}/month</p>
              <p style="margin:0 0 8px 0;font-size:0.875rem;color:#374151;"><strong>Signed by:</strong> ${agreedName}</p>
              <p style="margin:0;font-size:0.875rem;color:#374151;"><strong>Date:</strong> ${new Date(agreedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            <p style="color:#374151;font-size:0.875rem;">This email serves as your confirmation that you have agreed to the Trailblaize SaaS Agreement. A member of our team will reach out within 24 hours.</p>
            <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:12px 16px;margin:16px 0;">
              <p style="font-size:0.75rem;color:#6B7280;margin:0 0 6px 0;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Agreement Summary</p>
              <p style="font-size:0.8125rem;color:#374151;margin:0;line-height:1.6;">
                • 12-month initial commitment starting today<br/>
                • $${pricePerMonth}/month billed monthly<br/>
                • Cancel after year one with 30 days written notice<br/>
                • Your data belongs to you — never sold<br/>
                • Full agreement available at trailblaize.net/terms
              </p>
            </div>
            <a href="https://www.trailblaize.net/sign-in" style="display:inline-block;background:#0F172A;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px;">Log In to Your Platform →</a>
            <p style="color:#9ca3af;font-size:0.75rem;margin-top:24px;">Questions? Reply to this email or contact support@trailblaize.net</p>
          </div>
        `,
      });
    } catch (e) { console.warn('[set-up/complete] confirmation email error:', e); }

    // Email notifications
    const msg = `🎉 ${orgName} at ${school} just signed up — ${memberCount} members — $${pricePerMonth}/mo. Make the launch post!${bypass ? ' [Internal]' : ''}`;
    await Promise.allSettled([
      { email: 'owen@trailblaize.net', name: 'Owen' },
      { email: 'ford@trailblaize.net', name: 'Ford' },
      { email: 'adam@trailblaize.net', name: 'Adam' },
    ].map(t => sendEmail({
      to: t.email, toName: t.name,
      subject: `🎉 New signup: ${orgName} at ${school}`,
      htmlBody: `<div style="font-family:sans-serif;padding:24px;"><h2>New signup!</h2><p>${msg}</p><p><b>${leaderName}</b> · ${leaderEmail} · ${leaderPhone}</p></div>`,
    })));

    return NextResponse.json({ success: true, chapterId, loginUrl: 'https://trailblaize.space/login' });
  } catch (err: unknown) {
    console.error('[set-up/complete] error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 });
  }
}
