import Stripe from 'stripe';

// ─────────────────────────────────────────────────────────────────────────────
// Stripe client — lazy initialization to avoid build-time crash when key is missing
// ─────────────────────────────────────────────────────────────────────────────

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

// Keep stripe export for backward compat — lazily initialized
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const stripe: Stripe = new Proxy({} as Stripe, {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get(_target: any, prop: string | symbol) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getStripe() as any)[prop];
  },
}) as Stripe;

// ─────────────────────────────────────────────────────────────────────────────
// Pricing tiers (monthly, in dollars)
// ─────────────────────────────────────────────────────────────────────────────

export function getPriceTier(memberCount: number): number {
  if (memberCount < 100) return 99;
  if (memberCount < 175) return 199;
  if (memberCount < 250) return 299;
  if (memberCount < 325) return 399;
  if (memberCount < 400) return 499;
  return 599;
}

// ─────────────────────────────────────────────────────────────────────────────
// createOrGetCustomer
// ─────────────────────────────────────────────────────────────────────────────

export async function createOrGetCustomer(
  chapterId: string,
  chapterName: string,
  contactEmail: string,
): Promise<string> {
  // Search for existing customer by chapter_id metadata
  const existing = await stripe.customers.search({
    query: `metadata['chapter_id']:'${chapterId}'`,
    limit: 1,
  });

  if (existing.data.length > 0) {
    return existing.data[0].id;
  }

  // Create new customer
  const customer = await stripe.customers.create({
    name: chapterName,
    email: contactEmail,
    metadata: { chapter_id: chapterId },
  });

  return customer.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// createSubscription
// Creates a Stripe subscription with an incomplete payment, returns client_secret
// ─────────────────────────────────────────────────────────────────────────────

export async function createSubscription(
  customerId: string,
  memberCount: number,
  chapterId: string,
): Promise<{ subscriptionId: string; clientSecret: string; invoiceId: string }> {
  const priceInCents = getPriceTier(memberCount) * 100;

  // First, ensure a product exists for Trailblaize subscriptions
  const products = await stripe.products.search({
    query: `name:'Trailblaize Monthly Subscription'`,
    limit: 1,
  });

  let productId: string;
  if (products.data.length > 0) {
    productId = products.data[0].id;
  } else {
    const product = await stripe.products.create({
      name: 'Trailblaize Monthly Subscription',
    });
    productId = product.id;
  }

  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: priceInCents,
          product: productId,
          recurring: { interval: 'month' },
        },
      },
    ],
    metadata: { chapter_id: chapterId },
    payment_behavior: 'default_incomplete',
    expand: ['latest_invoice'],
  });

  const latestInvoice = subscription.latest_invoice as Stripe.Invoice;

  // Get the payment intent from the invoice's confirmation secret
  // In Stripe v21, we use the invoice's confirmation_secret or payment via invoice payments
  // For default_incomplete, we retrieve the PaymentIntent separately
  const invoiceId = latestInvoice.id!;

  // Retrieve the payment intent associated with the invoice
  const invoicePayments = await stripe.invoicePayments.list({
    invoice: invoiceId,
    limit: 1,
  });

  let clientSecret = '';
  if (invoicePayments.data.length > 0) {
    const payment = invoicePayments.data[0].payment;
    if (payment.type === 'payment_intent' && payment.payment_intent) {
      const piId = typeof payment.payment_intent === 'string'
        ? payment.payment_intent
        : payment.payment_intent.id;
      const pi = await stripe.paymentIntents.retrieve(piId);
      clientSecret = pi.client_secret ?? '';
    }
  }

  return {
    subscriptionId: subscription.id,
    clientSecret,
    invoiceId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// createInvoiceLink
// Creates a one-time invoice with hosted payment URL (sends email automatically)
// ─────────────────────────────────────────────────────────────────────────────

export async function createInvoiceLink(
  customerId: string,
  memberCount: number,
  chapterId: string,
): Promise<string> {
  const priceInCents = getPriceTier(memberCount) * 100;

  // Create a one-time invoice item
  await stripe.invoiceItems.create({
    customer: customerId,
    amount: priceInCents,
    currency: 'usd',
    description: `Trailblaize Monthly Subscription — ${memberCount} members ($${getPriceTier(memberCount)}/mo)`,
  });

  // Create the invoice
  const invoice = await stripe.invoices.create({
    customer: customerId,
    metadata: { chapter_id: chapterId },
    collection_method: 'send_invoice',
    days_until_due: 30,
  });

  // Finalize to get hosted URL
  const finalized = await stripe.invoices.finalizeInvoice(invoice.id!);

  // Send to customer email
  await stripe.invoices.sendInvoice(finalized.id!);

  return finalized.hosted_invoice_url!;
}
