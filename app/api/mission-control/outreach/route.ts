import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/mission-control/outreach
 * Aggregates outreach data for Mission Control dashboard:
 *   - Linq line health (3 lines)
 *   - Today's activity stats
 *   - Chapter funnels
 *   - Batch history (last 20)
 *   - Response inbox summary
 */
export async function GET() {
  const supabase = getSupabaseAdmin();
  const errors: Record<string, string> = {};

  // ── Linq lines ──────────────────────────────────────────────────────────
  let lines: unknown[] = [];
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('linq_line_config')
        .select('*')
        .order('line_number');

      if (!error && data && data.length > 0) {
        lines = data;
      } else {
        lines = [
          { line_number: 1, label: 'Owen', line_phone: '+16462101111', daily_limit: 45, is_paused: false },
          { line_number: 2, label: 'Adam', line_phone: '+16462178274', daily_limit: 45, is_paused: false },
          { line_number: 3, label: 'Ford', line_phone: '+16462442696', daily_limit: 45, is_paused: false },
        ];
      }
    } catch (e) {
      errors.lines = e instanceof Error ? e.message : 'Failed to fetch lines';
    }
  } else {
    errors.lines = 'Database not configured';
  }

  // ── Chapter funnel stats ──────────────────────────────────────────────
  let chapterStats: unknown[] = [];
  if (supabase) {
    try {
      const { data: chapters, error: chapErr } = await supabase
        .from('chapters')
        .select('id, chapter_name');

      if (!chapErr && chapters) {
        const summaries = await Promise.all(
          chapters.map(async (ch) => {
            const [
              { count: total },
              { count: have_phone },
              { count: contacted },
              { count: responded },
              { count: signed_up },
              { count: imessage },
            ] = await Promise.all([
              supabase.from('alumni_contacts').select('*', { count: 'exact', head: true }).eq('chapter_id', ch.id),
              supabase.from('alumni_contacts').select('*', { count: 'exact', head: true }).eq('chapter_id', ch.id).not('phone_primary', 'is', null),
              supabase.from('alumni_contacts').select('*', { count: 'exact', head: true }).eq('chapter_id', ch.id).neq('outreach_status', 'not_contacted'),
              supabase.from('alumni_contacts').select('*', { count: 'exact', head: true }).eq('chapter_id', ch.id).not('last_response_at', 'is', null),
              supabase.from('alumni_contacts').select('*', { count: 'exact', head: true }).eq('chapter_id', ch.id).eq('outreach_status', 'signed_up'),
              supabase.from('alumni_contacts').select('*', { count: 'exact', head: true }).eq('chapter_id', ch.id).eq('is_imessage', true),
            ]);
            if (!total || total === 0) return null;
            return {
              chapter_id: ch.id,
              chapter_name: ch.chapter_name,
              total: total ?? 0,
              have_phone: have_phone ?? 0,
              contacted: contacted ?? 0,
              responded: responded ?? 0,
              signed_up: signed_up ?? 0,
              imessage: imessage ?? 0,
            };
          })
        );
        chapterStats = summaries.filter(Boolean);
      }
    } catch (e) {
      errors.chapters = e instanceof Error ? e.message : 'Failed to fetch chapter stats';
    }
  }

  // ── Batch history (last 20) ───────────────────────────────────────────
  let batches: unknown[] = [];
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('outreach_batches')
        .select('*')
        .order('scheduled_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(20);
      if (!error && data) batches = data;
    } catch (e) {
      errors.batches = e instanceof Error ? e.message : 'Failed to fetch batches';
    }
  }

  // ── Today's stats from batches ────────────────────────────────────────
  const todayStr = new Date().toISOString().split('T')[0];
  const todayBatches = (batches as Array<{
    scheduled_date: string;
    status: string;
    notes: string | null;
    touch_breakdown?: { t1?: { total: number }; t2?: { total: number }; t3?: { total: number } };
  }>).filter((b) => b.scheduled_date === todayStr && b.status === 'completed');

  let todayT1 = 0, todayT2 = 0, todayT3 = 0, todaySent = 0, todayFailed = 0;
  for (const b of todayBatches) {
    const tb = b.touch_breakdown ?? {};
    todayT1 += tb.t1?.total ?? 0;
    todayT2 += tb.t2?.total ?? 0;
    todayT3 += tb.t3?.total ?? 0;
    try {
      const notes = typeof b.notes === 'string' ? JSON.parse(b.notes) : b.notes;
      todaySent += notes?.sent ?? 0;
      todayFailed += notes?.failed ?? 0;
    } catch { /* skip */ }
  }

  // ── Response inbox ────────────────────────────────────────────────────
  let responses: Array<{ outreach_status: string; flagged?: boolean }> = [];
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('alumni_contacts')
        .select('id, outreach_status, flagged')
        .not('last_response_at', 'is', null)
        .limit(500);
      if (!error && data) responses = data;
    } catch (e) {
      errors.responses = e instanceof Error ? e.message : 'Failed to fetch responses';
    }
  }

  const flagged = responses.filter((r) => r.flagged).length;
  const needsT2 = responses.filter((r) => r.outreach_status === 'touch1_confirmed').length;
  const totalResponses = responses.length;

  const stats = chapterStats as Array<{ signed_up: number; responded: number }>;
  const totalSignedUp = stats.reduce((sum, c) => sum + (c.signed_up ?? 0), 0);
  const totalResponded = stats.reduce((sum, c) => sum + (c.responded ?? 0), 0);

  return NextResponse.json({
    lines,
    chapters: chapterStats,
    batches,
    today_stats: {
      t1_sent: todayT1,
      t2_sent: todayT2,
      t3_sent: todayT3,
      sent: todaySent,
      failed: todayFailed,
      total_signed_up: totalSignedUp,
      total_responded: totalResponded,
    },
    inbox: {
      total: totalResponses,
      flagged,
      needs_t2: needsT2,
    },
    errors: Object.keys(errors).length > 0 ? errors : null,
    fetched_at: new Date().toISOString(),
  });
}
