import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { normalizeConference } from '@/lib/pipeline-conference';

export async function GET() {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const today = new Date();

  const minus7 = new Date(today);
  minus7.setDate(minus7.getDate() - 7);
  const minus7Str = minus7.toISOString();

  const minus14 = new Date(today);
  minus14.setDate(minus14.getDate() - 14);
  const minus14Str = minus14.toISOString();

  // Fetch all deals with org+school joined
  const { data: allDeals, error } = await admin
    .from('pipeline_deals')
    .select(`
      *,
      organization:organizations(*, school:schools(*), national_org:national_orgs(*)),
      contact:contacts(*)
    `)
    .order('next_followup', { ascending: true, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const deals = allDeals || [];

  // MRR: sum of closed_won deal values / 12
  const closedWon = deals.filter((d) => d.stage === 'closed_won');
  const totalClosedValue = closedWon.reduce((sum: number, d) => sum + (d.value || 0), 0);
  const mrr = Math.round(totalClosedValue / 12);

  // Closed deal count + chapter names
  const closedDealCount = closedWon.length;
  const closedChapters = closedWon
    .map((d) => d.organization?.name || '')
    .filter(Boolean) as string[];
  const closedDeals = closedWon
    .map((d) => ({
      id: d.id,
      chapterName: d.organization?.name || 'Unknown chapter',
      schoolName: d.organization?.school?.name || 'Unknown school',
      value: d.value ?? null,
      closedAt: d.updated_at ?? null,
      conference: normalizeConference(
        d.organization?.school?.conference || d.conference || 'Unknown',
      ),
    }))
    .sort((a, b) => {
      const aTime = a.closedAt ? new Date(a.closedAt).getTime() : 0;
      const bTime = b.closedAt ? new Date(b.closedAt).getTime() : 0;
      return bTime - aTime;
    });

  // Schools in Conversation: distinct schools where stage != 'closed_lost' AND stage != 'lost'
  // (includes hold_off and all active stages)
  const EXCLUDED_FROM_CONVO = ['closed_lost', 'lost'];
  const convoDeals = deals.filter((d) => !EXCLUDED_FROM_CONVO.includes(d.stage));
  const convoSchoolIds = new Set<string>();
  for (const d of convoDeals) {
    const sid = d.organization?.school?.id;
    if (sid) convoSchoolIds.add(sid);
  }
  const schoolsInConversation = convoSchoolIds.size;

  // Active deals (for conference tracker + map)
  const INACTIVE_STAGES = ['closed_lost', 'hold_off'];
  const activeDeals = deals.filter((d) => !INACTIVE_STAGES.includes(d.stage));

  // Demos LAST 7/14 days: stage IN ('demo_booked', 'first_demo') AND updated_at >= cutoff
  const DEMO_STAGES = ['demo_booked', 'first_demo', 'demo_completed'];
  const demosLast7 = deals.filter(
    (d) =>
      DEMO_STAGES.includes(d.stage) &&
      d.updated_at &&
      d.updated_at >= minus7Str
  ).length;

  const demosLast14 = deals.filter(
    (d) =>
      DEMO_STAGES.includes(d.stage) &&
      d.updated_at &&
      d.updated_at >= minus14Str
  ).length;

  // Decision Calls: schools with MORE THAN ONE deal AND at least one deal in a decision stage
  const DECISION_STAGES = ['second_call', 'negotiation', 'contract_sent'];
  const schoolDealMap = new Map<string, { count: number; hasDecision: boolean }>();
  for (const d of activeDeals) {
    const sid = d.organization?.school?.id;
    if (!sid) continue;
    const existing = schoolDealMap.get(sid) || { count: 0, hasDecision: false };
    schoolDealMap.set(sid, {
      count: existing.count + 1,
      hasDecision: existing.hasDecision || DECISION_STAGES.includes(d.stage),
    });
  }
  const decisionCalls = Array.from(schoolDealMap.values()).filter(
    (s) => s.count > 1 && s.hasDecision
  ).length;

  // By conference: group active deals by conference
  const confMap = new Map<string, { dealCount: number; pipelineValue: number }>();
  for (const d of activeDeals) {
    const conf = normalizeConference(
      d.organization?.school?.conference ||
      d.conference ||
      'Unknown',
    );
    const existing = confMap.get(conf) || { dealCount: 0, pipelineValue: 0 };
    confMap.set(conf, {
      dealCount: existing.dealCount + 1,
      pipelineValue: existing.pipelineValue + (d.value || 0),
    });
  }
  const byConference = Array.from(confMap.entries())
    .map(([conference, stats]) => ({ conference, ...stats }))
    .sort((a, b) => b.dealCount - a.dealCount);

  return NextResponse.json({
    mrr,
    mrrGoal: 10000,
    closedDealCount,
    closedChapters,
    closedDeals,
    schoolsInConversation,
    demosLast7,
    demosLast14,
    decisionCalls,
    // Legacy fields (kept for compatibility)
    demosNext7: demosLast7,
    demosNext14: demosLast14,
    decisionsNext7: decisionCalls,
    decisionsNext14: decisionCalls,
    byConference,
    recentDeals: activeDeals,
  });
}
