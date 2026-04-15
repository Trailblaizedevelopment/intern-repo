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

    // Send DocuSign contract (non-fatal)
    if (!bypass) {
      try {
        const contractRes = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL || 'https://trailblaize.space'}/api/chapters/${chapterId}/send-contract`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.INTERNAL_API_KEY || ''}` },
            body: JSON.stringify({ recipientEmail: leaderEmail, recipientName: leaderName, memberCount, chapterLegalName: designation ? `${orgName} ${designation}` : orgName }),
          }
        );
        if (!contractRes.ok) console.warn('[set-up/complete] DocuSign failed:', await contractRes.text());
      } catch (e) { console.warn('[set-up/complete] DocuSign error:', e); }
    }

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
