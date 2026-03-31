import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';

export async function GET() {
  try {
    const now = Math.floor(Date.now() / 1000);
    const in30Days = now + 30 * 24 * 60 * 60;

    // Fetch open invoices, recent charges, and active subscriptions in parallel
    const [invoicesRes, chargesRes, subsRes] = await Promise.all([
      stripe.invoices.list({ status: 'open', limit: 50 }),
      stripe.charges.list({ limit: 10 }),
      stripe.subscriptions.list({ status: 'active', limit: 100 }),
    ]);

    const upcoming_invoices = invoicesRes.data.filter((inv) => {
      const due = inv.due_date ?? 0;
      return due >= now && due <= in30Days;
    }).map((inv) => ({
      id: inv.id,
      customer_name: typeof inv.customer_email === 'string' ? inv.customer_email : (inv.customer as string),
      amount: inv.amount_due,
      currency: inv.currency,
      due_date: inv.due_date,
      hosted_invoice_url: inv.hosted_invoice_url,
    }));

    const overdue_invoices = invoicesRes.data.filter((inv) => {
      const due = inv.due_date ?? 0;
      return due > 0 && due < now;
    }).map((inv) => ({
      id: inv.id,
      customer_name: typeof inv.customer_email === 'string' ? inv.customer_email : (inv.customer as string),
      amount: inv.amount_due,
      currency: inv.currency,
      due_date: inv.due_date,
      hosted_invoice_url: inv.hosted_invoice_url,
    }));

    const recent_payments = chargesRes.data
      .filter((ch) => ch.status === 'succeeded')
      .map((ch) => ({
        id: ch.id,
        amount: ch.amount,
        currency: ch.currency,
        created: ch.created,
        description: ch.description ?? ch.statement_descriptor ?? 'Payment',
        customer_email: ch.billing_details?.email ?? null,
      }));

    return NextResponse.json({
      upcoming_invoices,
      overdue_invoices,
      recent_payments,
      subscription_count: subsRes.data.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
