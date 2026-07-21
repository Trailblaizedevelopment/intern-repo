import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

/**
 * POST /api/set-up/lead
 * Upserts a setup_leads row when a user initiates checkout.
 * Called client-side before redirecting to Stripe so we never lose the lead.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      orgName: string;
      school: string;
      orgType: string;
      memberCount: number;
      designation?: string;
      leaderName: string;
      leaderEmail: string;
      leaderPhone: string;
      instagramHandle?: string;
      pricePerMonth: number;
      stripeSessionId?: string;
      status?: string;
    };

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });

    const { error } = await supabase.from('setup_leads').upsert({
      org_name: body.orgName,
      school: body.school,
      org_type: body.orgType,
      member_count: body.memberCount,
      designation: body.designation || null,
      leader_name: body.leaderName,
      leader_email: body.leaderEmail,
      leader_phone: body.leaderPhone,
      instagram_handle: body.instagramHandle || null,
      price_per_month: body.pricePerMonth,
      stripe_session_id: body.stripeSessionId || null,
      status: body.status || 'checkout_started',
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'leader_email',
    });

    if (error) {
      console.error('[set-up/lead] upsert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('[set-up/lead] error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 });
  }
}
