import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const key = process.env.STRIPE_SECRET_KEY;

  if (!key) {
    return NextResponse.json({ error: 'Stripe not connected' }, { status: 200 });
  }

  const auth = `Basic ${Buffer.from(`${key}:`).toString('base64')}`;

  // Last 30 days
  const since = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);

  try {
    const [payoutsRes, chargesRes] = await Promise.all([
      fetch('https://api.stripe.com/v1/payouts?limit=10', {
        headers: { Authorization: auth },
        next: { revalidate: 0 },
      }),
      fetch(`https://api.stripe.com/v1/charges?limit=100&created[gte]=${since}`, {
        headers: { Authorization: auth },
        next: { revalidate: 0 },
      }),
    ]);

    if (!payoutsRes.ok || !chargesRes.ok) {
      const errBody = await (payoutsRes.ok ? chargesRes : payoutsRes).text();
      return NextResponse.json(
        { error: `Stripe API error: ${errBody}` },
        { status: 502 },
      );
    }

    const [payoutsData, chargesData] = await Promise.all([
      payoutsRes.json(),
      chargesRes.json(),
    ]);

    // Shape payouts
    const payouts = (payoutsData.data ?? []).map((p: Record<string, unknown>) => ({
      id: p.id as string,
      amount: p.amount as number,
      currency: p.currency as string,
      status: p.status as string,
      arrival_date: p.arrival_date as number,
      description: p.description as string | null,
      bank_last4: (p.destination as Record<string, unknown> | null)?.last4 ?? null,
    }));

    // Shape charges — successful only
    const charges = ((chargesData.data ?? []) as Array<Record<string, unknown>>)
      .filter((ch) => ch.status === 'succeeded')
      .map((ch) => ({
        id: ch.id as string,
        amount: ch.amount as number,
        currency: ch.currency as string,
        created: ch.created as number,
        description:
          (ch.description as string | null) ??
          (ch.statement_descriptor as string | null) ??
          'Payment',
        customer_email:
          (ch.billing_details as Record<string, unknown> | null)?.email ?? null,
      }));

    return NextResponse.json({ payouts, charges });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
