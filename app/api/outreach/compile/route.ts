import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { createChat, getRecipientService } from '@/lib/linq';

/**
 * POST /api/outreach/compile
 * On-demand outreach batch compiler. Mirrors cron logic but runs immediately
 * and returns full detail for the UI to display before approval.
 *
 * Also pre-allocates iMessage chats for all T1 contacts (Phase B) so that:
 *   (1) SMS contacts are filtered out at compile time
 *   (2) execute can skip Phase B and jump straight to sending
 *
 * Returns:
 *   { existing: true, batch: {...} }   — batch already exists for today
 *   { existing: false, batch: {...}, allocation: {...} }  — newly compiled batch
 *   { total: 0, message: string }      — nothing to send
 */

type LineConfig = {
  label: string;
  line_phone: string;
  is_paused: boolean;
  daily_limit: number;
  is_warmed_up: boolean | null;
  warmup_start_date: string | null;
  line_number: number;
};

const DEFAULT_LINES: LineConfig[] = [
  { line_number: 1, label: 'Owen', line_phone: '+16462408056', daily_limit: 45, is_paused: false, is_warmed_up: null, warmup_start_date: null },
  { line_number: 2, label: 'Adam', line_phone: '+16462668785', daily_limit: 45, is_paused: false, is_warmed_up: null, warmup_start_date: null },
  { line_number: 3, label: 'Ford', line_phone: '+16462442696', daily_limit: 45, is_paused: false, is_warmed_up: null, warmup_start_date: null },
];

/**
 * Warm-up-aware T1 cap for a line (mirrors execute endpoint logic).
 * is_warmed_up: null or true → return daily_limit
 * is_warmed_up: false        → ramp over 3 weeks
 */
function getLineT1Cap(line: LineConfig): number {
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

function getDecadeBucket(year: number | null | undefined): string {
  if (!year || year < 1970) return 'Unknown';
  const decade = Math.floor(year / 10) * 10;
  return `${decade}s`;
}

export async function POST() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  try {
    const today = new Date().toISOString().split('T')[0];

    // ── 1. Check if batch already exists for today ────────────────────────────
    const { data: existingBatches } = await supabase
      .from('outreach_batches')
      .select('*')
      .eq('scheduled_date', today)
      .order('created_at', { ascending: false })
      .limit(1);

    if (existingBatches && existingBatches.length > 0) {
      const existing = existingBatches[0];
      // Only block recompile if batch is actively pending or approved — not rejected/completed
      if (existing.status === 'pending_approval' || existing.status === 'approved') {
        return NextResponse.json({ existing: true, batch: existing });
      }
      // Rejected or completed — fall through and create a fresh batch
    }

    // ── 2. Fetch line configs ─────────────────────────────────────────────────
    const { data: lineConfigRows } = await supabase
      .from('linq_line_config')
      .select('label, line_phone, is_paused, daily_limit, is_warmed_up, warmup_start_date, line_number')
      .order('line_number');

    const lines: LineConfig[] = (lineConfigRows && lineConfigRows.length > 0)
      ? (lineConfigRows as LineConfig[])
      : DEFAULT_LINES;

    const activeLines = lines.filter(l => !l.is_paused);
    const activeCount = activeLines.length;

    if (activeCount === 0) {
      return NextResponse.json({ total: 0, message: 'All lines are paused — resume at least one line first.' });
    }

    const t1Total = activeLines.reduce((sum, l) => sum + getLineT1Cap(l), 0);
    const t2t3Total = activeCount * 100;

    // ── 3. Cutoffs ────────────────────────────────────────────────────────────
    const cutoff2days = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const cutoff4days = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();

    // ── 4. T1 eligible ────────────────────────────────────────────────────────
    // T1 pool: prefer confirmed-mobile contacts first, then unclassified (phone_type IS NULL)
    // Exclude known landline/voip entirely — they'll never be iMessage
    const { data: t1Raw } = await supabase
      .from('alumni_contacts')
      .select('id, chapter_id, year, phone_primary, linq_chat_id')
      .eq('outreach_status', 'not_contacted')
      .not('is_imessage', 'is', false)
      .not('phone_primary', 'is', null)
      .or('phone_type.is.null,and(phone_type.neq.landline,phone_type.neq.voip)')
      .gte('year', 1970)
      .limit(t1Total);

    const t1Contacts: { id: string; chapter_id: string; year?: number | null; phone_primary?: string | null; linq_chat_id?: string | null }[] = t1Raw || [];

    // ── 5. T2 nudge eligible (NON-RESPONDERS ONLY) ───────────────────────────
    // T2 = automated nudge for contacts who got T1 but never replied.
    // touch1_confirmed contacts are handled manually via "Send Pitch" in the inbox.
    // pitched contacts skip T2/T3 entirely (they're in a real conversation).
    const { data: t2aRaw } = await supabase
      .from('alumni_contacts')
      .select('id, chapter_id')
      .eq('outreach_status', 'touch1_sent')
      .lte('touch1_sent_at', cutoff2days)
      .is('touch2_sent_at', null)
      .not('is_imessage', 'is', false)
      .not('phone_primary', 'is', null)
      .limit(t2t3Total);

    // Part B: explicitly no_response AND touch1 >= 2 days ago
    const { data: t2bRaw } = await supabase
      .from('alumni_contacts')
      .select('id, chapter_id')
      .eq('outreach_status', 'no_response')
      .lte('touch1_sent_at', cutoff2days)
      .is('touch2_sent_at', null)
      .not('is_imessage', 'is', false)
      .not('phone_primary', 'is', null)
      .limit(t2t3Total);

    // Deduplicate
    const t2Map = new Map<string, { id: string; chapter_id: string }>();
    for (const c of [...(t2aRaw || []), ...(t2bRaw || [])]) {
      if (!t2Map.has(c.id)) t2Map.set(c.id, c);
    }
    const t2Contacts = [...t2Map.values()].slice(0, t2t3Total);

    // ── 6. T3 eligible ────────────────────────────────────────────────────────
    const t3Remaining = Math.max(0, t2t3Total - t2Contacts.length);
    let t3Contacts: { id: string; chapter_id: string }[] = [];
    if (t3Remaining > 0) {
      const { data: t3Raw } = await supabase
        .from('alumni_contacts')
        .select('id, chapter_id')
        .eq('outreach_status', 'touch2_sent')
        .lte('touch2_sent_at', cutoff4days)
        .is('touch3_sent_at', null)
        .not('is_imessage', 'is', false)
        .not('phone_primary', 'is', null)
        .limit(t3Remaining);
      t3Contacts = t3Raw || [];
    }

    // ── 6B. Phase B: Pre-allocate iMessage chats for T1 contacts ─────────────
    const allocatedChats: { contactId: string; chatId: string; lineNumber: number }[] = [];
    const smsRejected: string[] = [];
    const allocationFailed: string[] = [];

    // Only allocate for contacts that don't already have a linq_chat_id
    const needsAllocation = t1Contacts.filter(c => !c.linq_chat_id && c.phone_primary);

    // Round-robin assign lines (same as execute)
    let lineIdx = 0;
    const lineCycler = () => {
      const l = activeLines[lineIdx % activeLines.length];
      lineIdx++;
      return l;
    };

    // Process in parallel batches of 5
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
            // Mark as not iMessage — exclude from batch
            smsRejected.push(contact.id);
            await supabase.from('alumni_contacts').update({ is_imessage: false }).eq('id', contact.id);
          } else {
            // iMessage — store chat ID and assigned line
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

    // Remove SMS and failed contacts from T1 list
    // Contacts that already had linq_chat_id (pre-existing) are kept
    const rejectedSet = new Set([...smsRejected, ...allocationFailed]);
    const t1Final = t1Contacts.filter(c => !rejectedSet.has(c.id) || c.linq_chat_id);

    // Final contact counts
    const finalTotal = t1Final.length + t2Contacts.length + t3Contacts.length;

    // ── 10. Empty check ───────────────────────────────────────────────────────
    if (finalTotal === 0) {
      return NextResponse.json({ total: 0, message: 'No eligible contacts found.' });
    }

    // ── 7. Fetch chapter names ─────────────────────────────────────────────────
    const allChapterIds = [
      ...new Set([
        ...t1Final.map(c => c.chapter_id),
        ...t2Contacts.map(c => c.chapter_id),
        ...t3Contacts.map(c => c.chapter_id),
      ]),
    ].filter(Boolean);

    const { data: chapterRows } = await supabase
      .from('chapters')
      .select('id, chapter_name')
      .in('id', allChapterIds);

    const chapterMap = new Map<string, string>();
    for (const ch of chapterRows || []) {
      chapterMap.set(ch.id, ch.chapter_name || ch.id);
    }

    // ── 8. Build breakdowns ───────────────────────────────────────────────────
    const t1ByChapter: Record<string, number> = {};
    const t1ByYear: Record<string, number> = {};
    for (const c of t1Final) {
      const chName = chapterMap.get(c.chapter_id) || c.chapter_id;
      t1ByChapter[chName] = (t1ByChapter[chName] || 0) + 1;
      const decade = getDecadeBucket(c.year);
      t1ByYear[decade] = (t1ByYear[decade] || 0) + 1;
    }

    const t2ByChapter: Record<string, number> = {};
    for (const c of t2Contacts) {
      const chName = chapterMap.get(c.chapter_id) || c.chapter_id;
      t2ByChapter[chName] = (t2ByChapter[chName] || 0) + 1;
    }

    const t3ByChapter: Record<string, number> = {};
    for (const c of t3Contacts) {
      const chName = chapterMap.get(c.chapter_id) || c.chapter_id;
      t3ByChapter[chName] = (t3ByChapter[chName] || 0) + 1;
    }

    const touchBreakdown = {
      t1: { total: t1Final.length, by_chapter: t1ByChapter, by_year: t1ByYear },
      t2: { total: t2Contacts.length, by_chapter: t2ByChapter },
      t3: { total: t3Contacts.length, by_chapter: t3ByChapter },
    };

    // ── 9. Lines summary ──────────────────────────────────────────────────────
    const lineByLabel: Record<string, LineConfig> = {};
    for (const l of lines) {
      lineByLabel[l.label.toLowerCase()] = l;
    }

    function lineSummary(key: string) {
      const l = lineByLabel[key];
      if (!l) return { phone: '', status: 'unknown', t1_cap: 0 };
      return {
        phone: l.line_phone,
        status: l.is_paused ? 'paused' : 'active',
        t1_cap: l.is_paused ? 0 : getLineT1Cap(l),
      };
    }

    const linesSummary = {
      active: activeCount,
      owen: lineSummary('owen'),
      adam: lineSummary('adam'),
      ford: lineSummary('ford'),
    };

    // ── 11. Create batch record ───────────────────────────────────────────────
    const { data: newBatch, error: insertError } = await supabase
      .from('outreach_batches')
      .insert({
        scheduled_date: today,
        status: 'pending_approval',
        total_contacts: finalTotal,
        touch_breakdown: touchBreakdown,
        lines: linesSummary,
        notes: JSON.stringify({
          created_by: 'manual-compile',
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
      console.error('[compile] insert error:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // ── 12. Return ────────────────────────────────────────────────────────────
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
    console.error('[POST /api/outreach/compile]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
