import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const AUTH_TOKEN = process.env.INTERNAL_API_KEY || '';

const NEXT_TOUCH_STAGE: Record<string, string> = {
  touch1_sent: 'touch2_sent',
  touch2_sent: 'touch3_sent',
  touch3_sent: 'no_response',
};

/**
 * POST /api/outreach/conversations/bulk
 *
 * Bulk actions on a set of contacts.
 * Body: { action: 'next_touch' | 'handled' | 'flag', contact_ids: string[] }
 *
 * - next_touch: advance outreach_status to next stage. No messages sent.
 * - handled:    set handled_at = now()
 * - flag:       set flagged = true
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== AUTH_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const body = await req.json();
  const { action, contact_ids } = body as { action: string; contact_ids: string[] };

  if (!action || !Array.isArray(contact_ids) || contact_ids.length === 0) {
    return NextResponse.json({ error: 'action and contact_ids are required' }, { status: 400 });
  }

  if (!['next_touch', 'handled', 'flag'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  let updated = 0;

  if (action === 'next_touch') {
    // Fetch current statuses
    const { data: contacts, error } = await supabase
      .from('alumni_contacts')
      .select('id, outreach_status')
      .in('id', contact_ids);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    for (const contact of contacts || []) {
      const nextStage = NEXT_TOUCH_STAGE[contact.outreach_status];
      if (!nextStage) continue; // skip if no mapping (e.g. already no_response)

      const { error: updateError } = await supabase
        .from('alumni_contacts')
        .update({ outreach_status: nextStage })
        .eq('id', contact.id);

      if (!updateError) updated++;
    }
  } else if (action === 'handled') {
    const { error } = await supabase
      .from('alumni_contacts')
      .update({ handled_at: new Date().toISOString() })
      .in('id', contact_ids);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    updated = contact_ids.length;
  } else if (action === 'flag') {
    const { error } = await supabase
      .from('alumni_contacts')
      .update({ flagged: true })
      .in('id', contact_ids);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    updated = contact_ids.length;
  }

  return NextResponse.json({ updated });
}
