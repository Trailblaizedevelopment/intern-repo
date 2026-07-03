// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { reconcileLinearIssuesToTickets } from '@/lib/linear-reconcile';

const LINEAR_TEAM_ID = 'ba3a89b4-61f0-4a3e-85e4-b264de5cb592';

/**
 * POST /api/linear/reconcile
 * Upsert CRM tickets from cached linear_issues (no Linear API call).
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!auth?.includes(process.env.INTERNAL_API_KEY || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const teamId = body.teamId || LINEAR_TEAM_ID;

    const supabase = getSupabaseAdmin();
    const result = await reconcileLinearIssuesToTickets(supabase, teamId);

    return NextResponse.json({
      success: true,
      message: 'Reconcile completed',
      reconciled: result.reconciled,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error) {
    console.error('Error reconciling Linear issues to tickets:', error);
    const message = error instanceof Error ? error.message : 'Failed to reconcile';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
