import { NextRequest, NextResponse } from 'next/server';
import { stripe, getPriceTier } from '@/lib/stripe';

export const runtime = 'nodejs';

/**
 * POST /api/set-up/checkout
 * Creates a Stripe Checkout Session for the /set-up onboarding flow.
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
    };

    const {
      orgName,
      school,
      orgType,
      memberCount,
      leaderName,
      leaderEmail,
      leaderPhone,
      instagramHandle,
      designation,
      agreedName,
      agreedAt,
    } = body;

    if (!orgName || !school || !orgType || !memberCount || !leaderName || !leaderEmail || !leaderPhone) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const priceInDollars = getPriceTier(Number(memberCount));
    const priceInCents = priceInDollars * 100;

    const session = await stripe.checkout.sessions.create({
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
        orgName,
        school,
        orgType,
        memberCount: String(memberCount),
        leaderName,
        leaderEmail,
        leaderPhone,
        instagramHandle: instagramHandle || '',
        designation: designation || '',
        agreedName,
        agreedAt,
        pricePerMonth: String(priceInDollars),
      },
      success_url: `https://trailblaize.space/set-up?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://trailblaize.space/set-up?step=3`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: unknown) {
    console.error('[set-up/checkout] error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
