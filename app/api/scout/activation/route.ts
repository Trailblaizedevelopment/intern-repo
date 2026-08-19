import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

type EventRow = {
  event_type: string;
  community_id: string | null;
  industry: string | null;
  geo: string | null;
  persona: string | null;
  outcome: string | null;
  member_id: string;
};

function tally(rows: EventRow[], key: keyof EventRow): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const v = row[key];
    if (!v || typeof v !== 'string') continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([k, count]) => ({ key: k, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

/**
 * GET /api/scout/activation
 * Institution-shaped aggregates. Never selects message bodies, drafts, phones, or LinkedIn.
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } },
        { status: 500 }
      );
    }

    const { data, error } = await supabase
      .from('scout_activation_events')
      .select('event_type, community_id, industry, geo, persona, outcome, member_id')
      .order('created_at', { ascending: false })
      .limit(5000);

    if (error) {
      console.error('[GET /api/scout/activation]', error.message);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    const rows = (data || []) as EventRow[];
    const byType = (type: string) => rows.filter(r => r.event_type === type);
    const members = new Set(rows.map(r => r.member_id));

    const studentToAlumni = byType('intro_requested').filter(r => r.persona === 'alumni').length
      + byType('intro_accepted').filter(r => r.persona === 'alumni').length;

    const outcomes: Record<string, number> = {};
    for (const row of byType('outcome_reported')) {
      if (!row.outcome) continue;
      outcomes[row.outcome] = (outcomes[row.outcome] || 0) + 1;
    }

    const { count: declinedPathways } = await supabase
      .from('scout_pathways')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'declined');

    const declined = declinedPathways ?? 0;

    return NextResponse.json({
      data: {
        adoption: {
          members_with_events: members.size,
          opened: byType('scout_opened').length,
          repeat_turns: byType('repeat_turn').length,
        },
        pathways: {
          drafted: byType('pathway_drafted').length,
          confirmed: byType('intro_requested').length,
          declined,
        },
        intros: {
          requested: byType('intro_requested').length,
          accepted: byType('intro_accepted').length,
        },
        student_to_alumni: studentToAlumni,
        invites_suggested: byType('invite_suggested').length,
        outcomes,
        by_industry: tally(rows, 'industry'),
        by_location: tally(rows, 'geo'),
        by_community: tally(rows, 'community_id'),
      },
      error: null,
    });
  } catch (err) {
    console.error('[GET /api/scout/activation] Unexpected error:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
