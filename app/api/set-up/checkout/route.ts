import { NextRequest, NextResponse } from 'next/server';
import { stripe, getPriceTier } from '@/lib/stripe';

export const runtime = 'nodejs';

// Internal bypass codes — these skip Stripe entirely and go straight to completion
const INTERNAL_BYPASS_CODES = ['TRAILBLAIZE100', 'FOUNDER', 'INTERNAL'];

/**
 * POST /api/set-up/checkout
 * Creates a Stripe Checkout Session for the /set-up onboarding flow.
 * Supports discount codes via Stripe promotions, plus internal bypass codes.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      orgName: string;
      school: string;
      orgType: string;
      memberCount: number;
      leaderName: string;
      leaderEmail: string;
      leaderPhone: string;
      instagramHandle?: string;
      designation?: string;
      agreedName: string;
      agreedAt: string;
      discountCode?: string;
    };

    const {
      orgName, school, orgType, memberCount, leaderName, leaderEmail,
      leaderPhone, instagramHandle, designation, agreedName, agreedAt,
      discountCode,
    } = body;

    if (!orgName || !school || !orgType || !memberCount || !leaderName || !leaderEmail || !leaderPhone) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const priceInDollars = getPriceTier(Number(memberCount));
    const priceInCents = priceInDollars * 100;

    const codeUpper = (discountCode || '').toUpperCase().trim();

    // Internal bypass — skip Stripe, go straight to completion with a fake session token
    if (INTERNAL_BYPASS_CODES.includes(codeUpper)) {
      const bypassToken = `bypass_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      // Store the metadata in a short-lived way via URL params
      const params = new URLSearchParams({
        bypass: '1',
        orgName, school, orgType,
        memberCount: String(memberCount),
        leaderName, leaderEmail, leaderPhone,
        instagramHandle: instagramHandle || '',
        designation: designation || '',
        agreedName, agreedAt,
        pricePerMonth: String(priceInDollars),
        token: bypassToken,
      });
      return NextResponse.json({
        url: `https://trailblaize.space/set-up?success=true&bypass=1&${params.toString()}`,
      });
    }

    // Build Stripe session
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionParams: any = {
      mode: 'subscription',
      customer_email: leaderEmail,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: priceInCents,
            product_data: {
              name: 'Trailblaize Monthly Subscription',
              description: `Alumni relationship management platform — ${memberCount} members`,
            },
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      metadata: {
        orgName, school, orgType,
        memberCount: String(memberCount),
        leaderName, leaderEmail, leaderPhone,
        instagramHandle: instagramHandle || '',
        designation: designation || '',
        agreedName, agreedAt,
        pricePerMonth: String(priceInDollars),
      },
      success_url: `https://trailblaize.space/set-up?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://trailblaize.space/set-up?step=3`,
    };

    // If a discount code was entered, enable promo codes on the checkout
    if (codeUpper) {
      (sessionParams as any).allow_promotion_codes = true;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    console.error('[set-up/checkout] error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
