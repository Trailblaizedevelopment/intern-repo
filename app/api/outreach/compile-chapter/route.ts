import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { createChat, getRecipientService } from '@/lib/linq';

export const maxDuration = 300;

// ── Safety constants ──────────────────────────────────────────────────────────
// Maximum total contacts (T1+T2+T3) per batch.
// Raised from 30 → 150 (3 lines × 50 T1 cap).
// Large batches are now executed in chunks via cron (25 contacts per run,
// every 30 min 11am–4pm CST). The execute route handles chunking — no timeout risk.
const BATCH_TOTAL_CAP = 150;

/**
 * POST /api/outreach/compile-chapter
 * Per-chapter batch compiler. Same T1/T2/T3 eligibility logic as the global
 * compile endpoint, but scoped to a single chapter.
 *
 * Body: { chapter_id: string, date?: string }
 *
 * Caps:
 *   T1: 45 * active_lines (warm-up aware)
 *   T2/T3: 100 * active_lines
 *
 * Returns:
 *   { existing: true, batch: {...} }      — batch already exists for this chapter+date
 *   { existing: false, batch: {...} }     — newly compiled batch
 *   { total: 0, message: string }         — nothing to send
 */

type LineConfig = {
  id: string;
  label: string;
  line_phone: string;
  is_paused: boolean;
  daily_limit: number;
  is_warmed_up: boolean | null;
  warmup_start_date: string | null;
  line_number: number;
  last_used_at: string | null;
  round_robin_sequence: number;
};

const DEFAULT_LINES: LineConfig[] = [
  { id: 'default-1', line_number: 1, label: 'Owen', line_phone: '+16462101111', daily_limit: 45, is_paused: false, is_warmed_up: null, warmup_start_date: null, last_used_at: null, round_robin_sequence: 0 },
  { id: 'default-2', line_number: 2, label: 'Adam', line_phone: '+16462178274', daily_limit: 45, is_paused: false, is_warmed_up: null, warmup_start_date: null, last_used_at: null, round_robin_sequence: 0 },
  { id: 'default-3', line_number: 3, label: 'Ford', line_phone: '+16462442696', daily_limit: 45, is_paused: false, is_warmed_up: null, warmup_start_date: null, last_used_at: null, round_robin_sequence: 0 },
];

function getLineT1Cap(line: Pick<LineConfig, 'is_warmed_up' | 'warmup_start_date' | 'daily_limit'>): number {
  if (line.is_warmed_up !== false) return line.daily_limit;
  if (!line.warmup_start_date) return 10;
  const daysSinceStart = Math.floor(
    (Date.now() - new Date(line.warmup_start_date).getTime()) / (1000 * 60 * 60 * 24),
  );
  if (daysSinceStart < 7) return 10;
  if (daysSinceStart < 14) return 20;
  if (daysSinceStart < 21) return 30;
  return line.daily_limit;
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  let body: { chapter_id: string; date?: string; force?: boolean; t1_limit?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { chapter_id, date, force, t1_limit } = body;
  if (!chapter_id) {
    return NextResponse.json({ error: 'chapter_id is required' }, { status: 400 });
  }

  // Validate chapter exists
  const { data: chapter, error: chapErr } = await supabase
    .from('chapters')
    .select('id, chapter_name, school, fraternity, alumni_join_link')
    .eq('id', chapter_id)
    .single();

  if (chapErr || !chapter) {
    return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
  }

  const today = date || new Date().toISOString().split('T')[0];

  // Guard: chapter must have a join link before we send any pitch messages (T2/T3).
  // Sending trailblaize.net as a fallback link is a brand risk — wrong link per chapter.
  // T1 (verify only, no link) is still allowed even without a join link.
  if (!chapter.alumni_join_link) {
    console.warn(`[compile-chapter] Chapter ${chapter.chapter_name} has no alumni_join_link`);
    // We allow compile but will flag T2/T3 as zero if no link exists
  }

  try {
    // ── 1. Check if a batch already exists for this chapter+date ─────────────
    const { data: existingBatches } = await supabase
      .from('outreach_batches')
      .select('*')
      .eq('chapter_id', chapter_id)
      .eq('scheduled_date', today)
      .order('created_at', { ascending: false })
      .limit(1);

    if (existingBatches && existingBatches.length > 0) {
      const existing = existingBatches[0];
      if (existing.status === 'pending_approval' && force) {
        // Delete old pending batch so we can recompile with new settings
        await supabase.from('outreach_batches').delete().eq('id', existing.id);
      } else if (existing.status === 'approved' && force) {
        // Don't allow force-recompile over an approved batch — too risky
        return NextResponse.json({ error: 'Batch is already approved — cannot recompile. Reject it first.' }, { status: 409 });
      } else if (existing.status === 'pending_approval' || existing.status === 'approved') {
        return NextResponse.json({ existing: true, batch: existing });
      }
    }

    // ── 2. Fetch line configs ─────────────────────────────────────────────────
    const { data: lineConfigRows } = await supabase
      .from('linq_line_config')
      .select('id, label, line_phone, is_paused, daily_limit, is_warmed_up, warmup_start_date, line_number, last_used_at, round_robin_sequence')
      .order('line_number');

    const lines: LineConfig[] = (lineConfigRows && lineConfigRows.length > 0)
      ? (lineConfigRows as LineConfig[])
      : DEFAULT_LINES;

    const activeLines = lines.filter(l => !l.is_paused);
    const activeCount = activeLines.length;

    if (activeCount === 0) {
      return NextResponse.json({ total: 0, message: 'All lines are paused — resume at least one line first.' });
    }

    const t1CapMax = activeLines.reduce((sum, l) => sum + getLineT1Cap(l), 0);

    // ── 2b. Check how many T1s already sent TODAY across ALL chapters ─────────
    // This is the cross-chapter oversend guard. Each line has a daily limit.
    // We count touch1_sent_at from today 00:00 UTC per line to find remaining slots.
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartISO = todayStart.toISOString();

    const { data: sentTodayRows } = await supabase
      .from('alumni_contacts')
      .select('assigned_line')
      .not('touch1_sent_at', 'is', null)
      .gte('touch1_sent_at', todayStartISO);

    // Count per line
    const sentTodayPerLine: Record<number, number> = {};
    for (const row of sentTodayRows || []) {
      const ln = row.assigned_line as number;
      if (ln) sentTodayPerLine[ln] = (sentTodayPerLine[ln] || 0) + 1;
    }

    // Remaining capacity per line
    const remainingPerLine: Record<number, number> = {};
    for (const line of activeLines) {
      const cap = getLineT1Cap(line);
      const used = sentTodayPerLine[line.line_number] || 0;
      remainingPerLine[line.line_number] = Math.max(0, cap - used);
    }
    const t1CapRemaining = Object.values(remainingPerLine).reduce((a, b) => a + b, 0);

    // Apply user override, but never exceed remaining capacity
    // Default to 30 T1s if no override provided (safe default for new launches)
    const DEFAULT_T1 = 30;
    const t1Cap = (t1_limit != null && Number.isFinite(t1_limit))
      ? Math.min(Math.max(0, t1_limit), t1CapRemaining)
      : Math.min(DEFAULT_T1, t1CapRemaining);

    // T2+T3 cap = remaining slots after T1. Total batch capped at BATCH_TOTAL_CAP.
    // Chunked cron execution handles large batches — no single-request timeout risk.
    const t2t3TotalRemaining = Math.max(0, BATCH_TOTAL_CAP - t1Cap);
    const t2t3Cap = chapter.alumni_join_link
      ? Math.min(Math.min(activeCount * 100, 100), t2t3TotalRemaining)
      : 0; // No join link = no T2/T3 — never send pitch with wrong/missing link

    // ── 3. Cutoffs ────────────────────────────────────────────────────────────
    const cutoff2days = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const cutoff4days = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();

    // ── 4. T1 eligible (chapter-scoped) ──────────────────────────────────────
    const { data: t1Raw } = await supabase
      .from('alumni_contacts')
      .select('id, chapter_id, year, phone_primary, linq_chat_id')
      .eq('chapter_id', chapter_id)
      .eq('outreach_status', 'not_contacted')
      .not('is_imessage', 'is', false)
      .not('phone_primary', 'is', null)
      .not('first_name', 'is', null)
      .not('flagged', 'is', true)
      .or('phone_type.is.null,and(phone_type.neq.landline,phone_type.neq.voip)')
      .gte('year', 1970)
      .limit(t1Cap);

    const t1Contacts = t1Raw || [];

    // ── 5. T2 eligible (Track B ONLY — no-response drip) ─────────────────────
    // NOTE: touch1_confirmed contacts are intentionally excluded here.
    // The response monitor (alumni-response-monitor cron) owns Track A —
    // it fires T2 pitch immediately when someone replies. Putting confirmed
    // contacts in the batch drip would create a race condition and potentially
    // send two T2s. The batch handles only non-responders.
    const { data: t2aRaw } = await supabase
      .from('alumni_contacts')
      .select('id, chapter_id')
      .eq('chapter_id', chapter_id)
      .eq('outreach_status', 'touch1_sent')
      .lte('touch1_sent_at', cutoff2days)
      .is('touch2_sent_at', null)
      .not('is_imessage', 'is', false)
      .not('phone_primary', 'is', null)
      .not('first_name', 'is', null)
      .not('flagged', 'is', true)
      .gte('year', 1970)
      .limit(t2t3Cap);

    const { data: t2bRaw } = await supabase
      .from('alumni_contacts')
      .select('id, chapter_id')
      .eq('chapter_id', chapter_id)
      .eq('outreach_status', 'no_response')
      .lte('touch1_sent_at', cutoff2days)
      .is('touch2_sent_at', null)
      .not('is_imessage', 'is', false)
      .not('phone_primary', 'is', null)
      .not('first_name', 'is', null)
      .not('flagged', 'is', true)
      .gte('year', 1970)
      .limit(t2t3Cap);

    const t2Map = new Map<string, { id: string; chapter_id: string }>();
    for (const c of [...(t2aRaw || []), ...(t2bRaw || [])]) {
      if (!t2Map.has(c.id)) t2Map.set(c.id, c);
    }
    const t2Contacts = [...t2Map.values()].slice(0, t2t3Cap);

    // ── 6. T3 eligible ────────────────────────────────────────────────────────
    // Includes both touch2_sent (Track B drip) and pitched (Track A — confirmed,
    // received link, didn't sign up after 4 days). Separate message tone in execute.
    const t3Remaining = Math.max(0, t2t3Cap - t2Contacts.length);
    let t3Contacts: { id: string; chapter_id: string }[] = [];
    if (t3Remaining > 0) {
      const { data: t3RawB } = await supabase
        .from('alumni_contacts')
        .select('id, chapter_id')
        .eq('chapter_id', chapter_id)
        .eq('outreach_status', 'touch2_sent')
        .lte('touch2_sent_at', cutoff4days)
        .is('touch3_sent_at', null)
        .not('is_imessage', 'is', false)
        .not('phone_primary', 'is', null)
        .not('first_name', 'is', null)
        .not('flagged', 'is', true)
        .gte('year', 1970)
        .limit(t3Remaining);

      const { data: t3RawA } = await supabase
        .from('alumni_contacts')
        .select('id, chapter_id')
        .eq('chapter_id', chapter_id)
        .eq('outreach_status', 'pitched')
        .lte('touch2_sent_at', cutoff4days)
        .is('touch3_sent_at', null)
        .not('is_imessage', 'is', false)
        .not('phone_primary', 'is', null)
        .not('first_name', 'is', null)
        .not('flagged', 'is', true)
        .gte('year', 1970)
        .limit(t3Remaining);

      // Merge, dedup
      const t3Map = new Map<string, { id: string; chapter_id: string }>();
      for (const c of [...(t3RawB || []), ...(t3RawA || [])]) {
        if (!t3Map.has(c.id)) t3Map.set(c.id, c);
      }
      t3Contacts = [...t3Map.values()].slice(0, t3Remaining);
    }

    // ── 7. Pre-allocate iMessage chats for T1 ────────────────────────────────
    const allocatedChats: { contactId: string; chatId: string; lineNumber: number }[] = [];
    const smsRejected: string[] = [];
    const allocationFailed: string[] = [];

    const needsAllocation = t1Contacts.filter(c => !c.linq_chat_id && c.phone_primary);

    // Round-robin line assignment (oldest last_used_at first)
    const sortedLines = [...activeLines].sort((a, b) => {
      if (a.last_used_at === null) return -1;
      if (b.last_used_at === null) return 1;
      return new Date(a.last_used_at).getTime() - new Date(b.last_used_at).getTime();
    });

    let lineIdx = 0;
    const lineCycler = () => {
      const l = sortedLines[lineIdx % sortedLines.length];
      lineIdx++;
      return l;
    };

    const allocationBatches: typeof needsAllocation[] = [];
    for (let i = 0; i < needsAllocation.length; i += 5) {
      allocationBatches.push(needsAllocation.slice(i, i + 5));
    }

    for (const batch of allocationBatches) {
      await Promise.all(batch.map(async contact => {
        const line = lineCycler();
        try {
          const chat = await createChat(line.line_phone, contact.phone_primary!);
          const service = getRecipientService(chat);
          if (service === 'SMS') {
            smsRejected.push(contact.id);
            await supabase.from('alumni_contacts').update({ is_imessage: false }).eq('id', contact.id);
          } else {
            allocatedChats.push({ contactId: contact.id, chatId: chat.id, lineNumber: line.line_number });
            await supabase.from('alumni_contacts').update({
              linq_chat_id: chat.id,
              assigned_line: line.line_number,
            }).eq('id', contact.id);
          }
        } catch {
          allocationFailed.push(contact.id);
        }
      }));
    }

    const smsSet = new Set(smsRejected);
    const t1Final = t1Contacts.filter(c => !smsSet.has(c.id));

    const finalTotal = t1Final.length + t2Contacts.length + t3Contacts.length;

    if (finalTotal === 0) {
      return NextResponse.json({ total: 0, message: 'No eligible contacts found for this chapter.' });
    }

    // ── 8. Build touch breakdown ──────────────────────────────────────────────
    const touchBreakdown = {
      t1: { total: t1Final.length, by_chapter: { [chapter.chapter_name]: t1Final.length } },
      t2: { total: t2Contacts.length, by_chapter: { [chapter.chapter_name]: t2Contacts.length } },
      t3: { total: t3Contacts.length, by_chapter: { [chapter.chapter_name]: t3Contacts.length } },
    };

    // ── 9. Lines summary ──────────────────────────────────────────────────────
    const linesSummary = {
      active: activeCount,
      t1_cap: t1Cap,
      t1_remaining: t1CapRemaining,
      t2t3_cap: t2t3Cap,
      batch_total_cap: BATCH_TOTAL_CAP,
      join_link_missing: !chapter.alumni_join_link,
    };

    // ── 10. Create batch record ───────────────────────────────────────────────
    const { data: newBatch, error: insertError } = await supabase
      .from('outreach_batches')
      .insert({
        scheduled_date: today,
        chapter_id: chapter_id,
        status: 'pending_approval',
        total_contacts: finalTotal,
        touch_breakdown: touchBreakdown,
        lines: linesSummary,
        notes: JSON.stringify({
          created_by: 'per-chapter-compile',
          chapter_name: chapter.chapter_name,
          allocated_chats: allocatedChats.length,
          sms_rejected: smsRejected.length,
          allocation_failed: allocationFailed.length,
          contact_ids: {
            t1: t1Final.map(c => c.id),
            t2: t2Contacts.map(c => c.id),
            t3: t3Contacts.map(c => c.id),
          },
        }),
      })
      .select()
      .single();

    if (insertError) {
      console.error('[compile-chapter] insert error:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      existing: false,
      batch: newBatch,
      allocation: {
        allocated: allocatedChats.length,
        sms_rejected: smsRejected.length,
        failed: allocationFailed.length,
      },
    });

  } catch (err) {
    console.error('[POST /api/outreach/compile-chapter]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
