import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const getDB = () => getSupabaseAdmin()!;
import { createOrGetCustomer, createInvoiceLink } from '@/lib/stripe';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: chapterId } = await params;
    const { memberCount, contactEmail, chapterName } = await req.json() as {
      memberCount: number;
      contactEmail: string;
      chapterName: string;
    };

    if (!chapterId || !memberCount || !contactEmail || !chapterName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Create or retrieve Stripe customer
    const customerId = await createOrGetCustomer(chapterId, chapterName, contactEmail);

    // Create invoice with hosted payment link (sends email to customer automatically)
    const invoiceUrl = await createInvoiceLink(customerId, memberCount, chapterId);

    // Update chapters table
    const { error: dbError } = await supabase
      .from('chapters')
      .update({
        invoice_sent_at: new Date().toISOString(),
        invoice_status: 'sent',
        stripe_customer_id: customerId,
        stripe_subscription_id: null,
        member_count: memberCount,
        wizard_step: 4,
      })
      .eq('id', chapterId);

    if (dbError) {
      console.error('Supabase update error:', dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({ invoiceUrl, customerId });
  } catch (err: unknown) {
    console.error('send-invoice error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
