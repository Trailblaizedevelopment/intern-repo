import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET() {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const plus7 = new Date(today);
  plus7.setDate(plus7.getDate() + 7);
  const plus7Str = plus7.toISOString().split('T')[0];

  const plus14 = new Date(today);
  plus14.setDate(plus14.getDate() + 14);
  const plus14Str = plus14.toISOString().split('T')[0];

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

  // Active deals (exclude closed_lost and hold_off)
  const INACTIVE_STAGES = ['closed_lost', 'hold_off'];
  const activeDeals = deals.filter((d) => !INACTIVE_STAGES.includes(d.stage));

  // Schools in conversation: unique schools with at least 1 active deal
  const schoolIds = new Set<string>();
  for (const d of activeDeals) {
    const sid = d.organization?.school?.id;
    if (sid) schoolIds.add(sid);
  }
  const schoolsInConversation = schoolIds.size;

  // Demos: stage IN ('demo_booked','first_demo') AND next_followup <= today+7 or +14
  const DEMO_STAGES = ['demo_booked', 'first_demo'];
  const demosNext7 = deals.filter(
    (d) =>
      DEMO_STAGES.includes(d.stage) &&
      d.next_followup &&
      d.next_followup >= todayStr &&
      d.next_followup <= plus7Str
  ).length;
  const demosNext14 = deals.filter(
    (d) =>
      DEMO_STAGES.includes(d.stage) &&
      d.next_followup &&
      d.next_followup >= todayStr &&
      d.next_followup <= plus14Str
  ).length;

  // Decisions: stage = 'second_call' AND next_followup within range
  const decisionsNext7 = deals.filter(
    (d) =>
      d.stage === 'second_call' &&
      d.next_followup &&
      d.next_followup >= todayStr &&
      d.next_followup <= plus7Str
  ).length;
  const decisionsNext14 = deals.filter(
    (d) =>
      d.stage === 'second_call' &&
      d.next_followup &&
      d.next_followup >= todayStr &&
      d.next_followup <= plus14Str
  ).length;

  // By conference: group active deals by conference
  const confMap = new Map<string, { dealCount: number; pipelineValue: number }>();
  for (const d of activeDeals) {
    const conf =
      d.organization?.school?.conference ||
      d.conference ||
      'Unknown';
    const existing = confMap.get(conf) || { dealCount: 0, pipelineValue: 0 };
    confMap.set(conf, {
      dealCount: existing.dealCount + 1,
      pipelineValue: existing.pipelineValue + (d.value || 0),
    });
  }
  const byConference = Array.from(confMap.entries())
    .map(([conference, stats]) => ({ conference, ...stats }))
    .sort((a, b) => b.dealCount - a.dealCount);

  // Closed deal count (visible to all roles)
  const closedDealCount = closedWon.length;

  return NextResponse.json({
    mrr,
    mrrGoal: 10000,
    closedDealCount,
    schoolsInConversation,
    demosNext7,
    demosNext14,
    decisionsNext7,
    decisionsNext14,
    byConference,
    recentDeals: activeDeals,
  });
}
