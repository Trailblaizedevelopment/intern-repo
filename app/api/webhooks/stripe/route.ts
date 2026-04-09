import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: extract chapter_id from invoice
// ─────────────────────────────────────────────────────────────────────────────

async function getChapterIdFromInvoice(invoice: Stripe.Invoice): Promise<string | null> {
  // 1. Invoice-level metadata
  if (invoice.metadata?.chapter_id) return invoice.metadata.chapter_id;

  // 2. Subscription metadata snapshot (via invoice.parent.subscription_details)
  if (invoice.parent?.type === 'subscription_details' && invoice.parent.subscription_details) {
    const details = invoice.parent.subscription_details;

    // Check snapshot metadata first
    if (details.metadata?.chapter_id) return details.metadata.chapter_id;

    // Fall back to fetching the subscription directly
    const subscriptionId = typeof details.subscription === 'string'
      ? details.subscription
      : details.subscription?.id;

    if (subscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        if (subscription.metadata?.chapter_id) return subscription.metadata.chapter_id;
      } catch (err) {
        console.error('Failed to retrieve subscription:', err);
      }
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/webhooks/stripe
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: unknown) {
    console.error('Webhook signature verification failed:', err);
    const message = err instanceof Error ? err.message : 'Webhook error';
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error('DB unavailable');

    switch (event.type) {
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const chapterId = await getChapterIdFromInvoice(invoice);

        if (chapterId) {
          const { error } = await supabase
            .from('chapters')
            .update({
              invoice_paid_at: new Date().toISOString(),
              invoice_status: 'paid',
              // Promote chapter to active so Finance MRR picks it up
              status: 'active',
              last_payment_date: new Date().toISOString().split('T')[0],
            })
            .eq('id', chapterId);

          if (error) console.error('Supabase update error (invoice.paid):', error);
          else console.log(`[stripe-webhook] Chapter ${chapterId} invoice paid — promoted to active`);
        } else {
          console.warn('invoice.paid: no chapter_id found in metadata', invoice.id);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const chapterId = await getChapterIdFromInvoice(invoice);

        if (chapterId) {
          const { error } = await supabase
            .from('chapters')
            .update({ invoice_status: 'payment_failed' })
            .eq('id', chapterId);

          if (error) console.error('Supabase update error (invoice.payment_failed):', error);
        } else {
          console.warn('invoice.payment_failed: no chapter_id found in metadata', invoice.id);
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    // Always return 200 to prevent Stripe retries
    console.error('Webhook handler error:', err);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
