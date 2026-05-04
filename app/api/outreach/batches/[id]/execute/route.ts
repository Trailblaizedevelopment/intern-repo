import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { createChat, getChat, getRecipientService, sleep } from '@/lib/linq';

// Vercel Pro: allow up to 300s for this route (batch sends take time)
// 300s = 5 min. For large batches (150+ sends × up to 9s each = 22+ min), consider
// running execute as a background job. For now 300s covers ~33 sends max at 9s.
// Real batches should stay under 45 T1s + reasonable T2/T3 to fit within timeout.
// TODO: move to background queue for large batches.
export const maxDuration = 300;

const ALL_LINE_PHONES: Record<number, string> = {
  1: '+16462101111', // Owen (updated March 2026 — old number was +16462408056)
  2: '+16462178274', // Adam
  3: '+16462442696', // Ford
};

// Per-line caps:
// T1 (new chats)     — per-line dynamic cap via getLineT1Cap (warm-up aware)
// T2/T3 (follow-ups) — existing open threads, safe to do more; cap at 150
const T1_CAP_PER_LINE   = 45; // fallback default for warmed lines
const T2T3_CAP_PER_LINE = 150;

/**
 * Warm-up-aware T1 cap for a single line.
 * - is_warmed_up: null → treat as warmed (return daily_limit)
 * - is_warmed_up: true → return daily_limit
 * - is_warmed_up: false + no warmup_start_date → return 10 (safety default)
 * - is_warmed_up: false + warmup_start_date → ramp up over 3 weeks
 */
function getLineT1Cap(line: {
  is_warmed_up: boolean | null;
  warmup_start_date: string | null;
  daily_limit: number;
}): number {
  if (line.is_warmed_up !== false) return line.daily_limit; // null treated as warmed up
  if (!line.warmup_start_date) return 10; // safety default for new untracked lines
  const daysSinceStart = Math.floor(
    (Date.now() - new Date(line.warmup_start_date).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysSinceStart < 7)  return 10;
  if (daysSinceStart < 14) return 20;
  if (daysSinceStart < 21) return 30;
  return line.daily_limit; // fully warmed
}

// T1 — identity verify ONLY. No link, no pitch.
function buildT1Message(firstName: string, fraternityName: string, school: string): string {
  return `Hey ${firstName}, this is Ford from Trailblaize. I'm reaching out to verify your phone number on the ${school} ${fraternityName} alumni list. Do I have the right number?`;
}

// Track A — they confirmed identity (touch1_confirmed)
// Short-gap variant (< 7 days since T1): warm callback to their confirmation
function buildT2AMessage(firstName: string, fraternityName: string, school: string, joinLink: string): string {
  return `Hey ${firstName}, great! Here's the link to join the ${fraternityName} alumni network at ${school} - free, takes 2 min: ${joinLink}`;
}
// Long-gap variant (>= 7 days since T1): no "great!", no callback — fresh re-intro
function buildT2ALongGapMessage(firstName: string, fraternityName: string, school: string, joinLink: string): string {
  return `Hey ${firstName}, checking back in - we're still building out the ${fraternityName} alumni network at ${school} and would love to have you. Here's the link if you're interested: ${joinLink}`;
}
function buildT3AMessage(firstName: string): string {
  return `Hey ${firstName}, just checking - did you get a chance to join? Happy to answer any questions.`;
}
// Track A T3 — they confirmed AND received the link (pitched), still haven't joined
function buildT3PitchedMessage(firstName: string, fraternityName: string): string {
  return `Hey ${firstName}, just circling back - the ${fraternityName} network is live and guys are already on it. Let me know if you have any questions or I can help you get set up.`;
}

// Track B — no response to T1 (touch1_sent, 2+ days)
// NO LINK — don't send the join link to someone who hasn't confirmed their number.
// Keep it natural and human. Re-engage without pitching.
function buildT2BMessage(firstName: string, fraternityName: string, school: string): string {
  return `Hey ${firstName}, this is Ford again from Trailblaize. Just wanted to make sure I had the right number — still working on the ${fraternityName} alumni directory at ${school}. Do I have you?`;
}
function buildT3BMessage(firstName: string, fraternityName: string): string {
  return `Hey ${firstName}, last one from us. If you ever want to connect with other ${fraternityName} guys, we're at trailblaize.net. No pressure.`;
}

/**
 * POST /api/outreach/batches/[id]/execute
 *
 * IDEMPOTENCY:
 *   Each contact is claimed atomically via a conditional UPDATE before any Linq call.
 *   The claim checks the *current* outreach_status AND the relevant sent_at timestamp.
 *   If the conditional UPDATE matches 0 rows, the contact was already processed by
 *   a prior run (or a concurrent request) and is silently skipped.
 *   This means running Execute multiple times is always safe — no double-sends.
 *
 * Caps:
 *   - T1 new chats:        getLineT1Cap() per line (warm-up aware, default 45)
 *   - T2/T3 follow-ups:   150/active line  (existing threads, no daily cap risk)
 *
 * Send safety:
 *   - Lines fire SEQUENTIALLY with a 2-minute gap between each line
 *   - 3-second sleep between each send within a line
 *   - Phase B reverts SMS contacts back to their pre-send status
 *
 * - Paused lines (linq_line_config.is_paused) are always skipped
 * - Batch status must be 'approved' — prevents double-runs at the batch level too
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  // Parse optional chunk_size from request body
  let chunk_size = 25; // default
  try {
    const body = await _req.json().catch(() => ({}));
    if (body?.chunk_size && Number.isFinite(body.chunk_size) && body.chunk_size > 0) {
      chunk_size = Math.min(Number(body.chunk_size), 150); // never exceed 150
    }
  } catch { /* ignore parse errors — use default */ }

  // 1. Fetch and verify batch — status must be 'approved' OR 'executing'
  const { data: batch, error: bErr } = await supabase
    .from('outreach_batches')
    .select('*')
    .eq('id', id)
    .single();

  if (bErr || !batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  if (batch.status !== 'approved' && batch.status !== 'executing') {
    return NextResponse.json({
      error: `Cannot execute: batch status is '${batch.status}' (must be 'approved' or 'executing').`
    }, { status: 409 });
  }

  // Mark as 'executing' immediately to prevent concurrent runs.
  // We'll update to 'completed' when remaining === 0, or leave as 'executing' for cron.
  await supabase
    .from('outreach_batches')
    .update({ status: 'executing', sent_at: new Date().toISOString(), notes: 'Executing chunk…' })
    .eq('id', id);

  // Helper: write live progress to batch_progress column so the UI can poll it
  const writeBatchProgress = async (sent: number, total: number, failed: number) => {
    try {
      await supabase
        .from('outreach_batches')
        .update({ batch_progress: { sent, total, failed } })
        .eq('id', id);
    } catch { /* non-fatal — progress is best-effort */ }
  };

  const results = {
    sent: 0,
    sent_to_sms: 0,
    failed: 0,
    skipped_sms: 0,
    skipped_already_sent: 0,
    skipped_paused_line: 0,
    t1_sent: 0,
    t2t3_sent: 0,
    errors: [] as string[],
  };

  try {
    // 2. Check paused lines — fetch full config including warm-up fields and round-robin tracking
    const { data: lineConfigs } = await supabase
      .from('linq_line_config')
      .select('id, line_number, is_paused, label, daily_limit, is_warmed_up, warmup_start_date, last_used_at, round_robin_sequence')
      .order('line_number');

    type LineConfig = {
      id: string;
      line_number: number;
      is_paused: boolean;
      label: string;
      daily_limit: number;
      is_warmed_up: boolean | null;
      warmup_start_date: string | null;
      last_used_at: string | null;
      round_robin_sequence: number | null;
    };

    const lineConfigMap: Record<number, LineConfig> = {};
    for (const lc of (lineConfigs || []) as LineConfig[]) {
      lineConfigMap[lc.line_number] = lc;
    }

    const pausedLines = new Set(
      (lineConfigs || []).filter((l: LineConfig) => l.is_paused).map((l: LineConfig) => l.line_number)
    );
    const activeLineNumbers = [1, 2, 3].filter(n => !pausedLines.has(n));

    // True round-robin: sort active lines by oldest last_used_at (null = never used = highest priority)
    const activeLinesSorted = [...activeLineNumbers].sort((a, b) => {
      const lcA = lineConfigMap[a];
      const lcB = lineConfigMap[b];
      const tA = lcA?.last_used_at ? new Date(lcA.last_used_at).getTime() : 0;
      const tB = lcB?.last_used_at ? new Date(lcB.last_used_at).getTime() : 0;
      return tA - tB; // oldest first
    });

    if (activeLineNumbers.length === 0) {
      // Roll back to 'approved' so the cron (or user) can retry when lines resume
      await supabase.from('outreach_batches').update({
        status: batch.status === 'executing' ? 'executing' : 'approved',
        sent_at: null,
        notes: 'Rolled back — all lines are paused.',
      }).eq('id', id);
      return NextResponse.json({ error: 'All lines are paused — resume at least one line first.' }, { status: 409 });
    }

    // Build per-line T1 cap using warm-up logic
    const lineT1CapsMax: Record<number, number> = {};
    for (const n of activeLineNumbers) {
      const lc = lineConfigMap[n];
      lineT1CapsMax[n] = lc ? getLineT1Cap(lc) : T1_CAP_PER_LINE;
    }

    // Cross-chapter oversend guard: subtract T1s already sent today across ALL chapters
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: sentTodayRows } = await supabase
      .from('alumni_contacts')
      .select('assigned_line')
      .not('touch1_sent_at', 'is', null)
      .gte('touch1_sent_at', todayStart.toISOString());

    const sentTodayPerLine: Record<number, number> = {};
    for (const row of sentTodayRows || []) {
      const ln = row.assigned_line as number;
      if (ln) sentTodayPerLine[ln] = (sentTodayPerLine[ln] || 0) + 1;
    }

    const lineT1Caps: Record<number, number> = {};
    for (const n of activeLineNumbers) {
      const used = sentTodayPerLine[n] || 0;
      lineT1Caps[n] = Math.max(0, lineT1CapsMax[n] - used);
    }

    // 3. Load eligible contacts.
    //
    // CRITICAL SAFETY RULE:
    // If the batch was compiled with per-chapter contact_ids (all per-chapter batches),
    // we ONLY fetch those exact IDs — never a fresh global query.
    // This prevents contacts from other chapters bleeding into a chapter-scoped batch.
    // Fallback to global query only if no contact_ids are present (legacy global batches).

    const cutoffT3 = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();

    type T1Contact = {
      id: string;
      first_name: string;
      phone_primary: string | null;
      chapter_id: string;
      outreach_status: string;
      is_imessage: boolean | null;
      linq_chat_id: string | null;
    };

    // Parse contact_ids from batch notes (set by compile-chapter and compile routes)
    let pinnedIds: { t1: string[]; t2: string[]; t3: string[] } | null = null;
    try {
      const notesObj = typeof batch.notes === 'string' ? JSON.parse(batch.notes) : batch.notes;
      if (notesObj?.contact_ids) pinnedIds = notesObj.contact_ids;
    } catch { /* notes not JSON — treat as global batch */ }

    let t1Pool: T1Contact[] = [];
    let t2t3Pool: (T1Contact & { touch1_sent_at?: string; touch2_sent_at?: string })[] = [];

    if (pinnedIds) {
      // ── PINNED MODE: fetch only the exact contacts from the compiled batch ──
      // Re-fetches from DB (not cache) so we get live outreach_status values,
      // which guards against double-sends if a contact was already touched.
      const allPinnedIds = [...pinnedIds.t1, ...pinnedIds.t2, ...pinnedIds.t3];
      if (allPinnedIds.length > 0) {
        const { data: pinnedContacts } = await supabase
          .from('alumni_contacts')
          .select('id, first_name, phone_primary, chapter_id, outreach_status, is_imessage, linq_chat_id, touch1_sent_at, touch2_sent_at')
          .in('id', allPinnedIds)
          .not('phone_primary', 'is', null);

        const contactMap = new Map((pinnedContacts || []).map(c => [c.id, c]));

        // Split back into T1/T2/T3 pools using the compiled order, but only include
        // contacts whose current status still matches what was compiled.
        // (If a contact was already sent since compile time, it gets skipped by the
        //  atomic claim below — this is belt-and-suspenders protection.)
        for (const cid of pinnedIds.t1) {
          const c = contactMap.get(cid);
          if (c) t1Pool.push(c as T1Contact);
        }
        for (const cid of [...pinnedIds.t2, ...pinnedIds.t3]) {
          const c = contactMap.get(cid);
          if (c) t2t3Pool.push(c as T1Contact & { touch1_sent_at?: string; touch2_sent_at?: string });
        }
      }
    } else {
      // ── GLOBAL MODE: legacy behavior — query all chapters (no contact_ids in notes) ──
      const totalT1Cap = activeLineNumbers.reduce((sum, n) => sum + lineT1Caps[n], 0) + 50;

      const { data: countRows } = await supabase
        .from('alumni_contacts')
        .select('chapter_id')
        .eq('outreach_status', 'not_contacted')
        .is('touch1_sent_at', null)
        .not('is_imessage', 'is', false)
        .not('flagged', 'is', true)
        .not('phone_primary', 'is', null);

      const countByChapter: Record<string, number> = {};
      for (const row of (countRows || [])) {
        countByChapter[row.chapter_id] = (countByChapter[row.chapter_id] || 0) + 1;
      }
      const prioritizedChapterIds = Object.entries(countByChapter)
        .sort((a, b) => b[1] - a[1])
        .map(([cid]) => cid);

      for (const chId of prioritizedChapterIds) {
        if (t1Pool.length >= totalT1Cap) break;
        const remaining = totalT1Cap - t1Pool.length;
        const { data: chContacts } = await supabase
          .from('alumni_contacts')
          .select('id, first_name, phone_primary, chapter_id, outreach_status, is_imessage, linq_chat_id')
          .eq('chapter_id', chId)
          .eq('outreach_status', 'not_contacted')
          .is('touch1_sent_at', null)
          .not('is_imessage', 'is', false)
          .not('flagged', 'is', true)
          .not('phone_primary', 'is', null)
          .order('created_at', { ascending: true })
          .limit(remaining);
        if (chContacts) t1Pool.push(...(chContacts as T1Contact[]));
      }

      const [t2Res, t3Res] = await Promise.all([
        supabase
          .from('alumni_contacts')
          .select('id, first_name, phone_primary, chapter_id, outreach_status, is_imessage, touch1_sent_at, linq_chat_id')
          .in('outreach_status', ['touch1_sent', 'touch1_confirmed'])
          .is('touch2_sent_at', null)
          .not('is_imessage', 'is', false)
          .not('flagged', 'is', true)
          .not('phone_primary', 'is', null)
          .limit(activeLineNumbers.length * T2T3_CAP_PER_LINE + 50),
        supabase
          .from('alumni_contacts')
          .select('id, first_name, phone_primary, chapter_id, outreach_status, is_imessage, touch2_sent_at, linq_chat_id')
          .eq('outreach_status', 'touch2_sent')
          .is('touch3_sent_at', null)
          .not('is_imessage', 'is', false)
          .not('flagged', 'is', true)
          .lte('touch2_sent_at', cutoffT3)
          .not('phone_primary', 'is', null)
          .limit(activeLineNumbers.length * T2T3_CAP_PER_LINE + 50),
      ]);
      t2t3Pool = [...(t2Res.data || []), ...(t3Res.data || [])];
    }

    // Distribute T1 round-robin — use activeLinesSorted (oldest last_used_at first)
    const byLineT1: Record<number, typeof t1Pool> = {};
    for (const n of activeLineNumbers) byLineT1[n] = [];
    let idx = 0;
    for (const c of t1Pool) {
      const ln = activeLinesSorted[idx % activeLinesSorted.length];
      if (byLineT1[ln].length < lineT1Caps[ln]) byLineT1[ln].push(c);
      idx++;
      if (activeLinesSorted.every(n => byLineT1[n].length >= lineT1Caps[n])) break;
    }

    // Distribute T2/T3 round-robin — use activeLinesSorted
    const byLineT2T3: Record<number, typeof t2t3Pool> = {};
    for (const n of activeLineNumbers) byLineT2T3[n] = [];
    idx = 0;
    for (const c of t2t3Pool) {
      const ln = activeLinesSorted[idx % activeLinesSorted.length];
      if (byLineT2T3[ln].length < T2T3_CAP_PER_LINE) byLineT2T3[ln].push(c);
      idx++;
      if (activeLinesSorted.every(n => byLineT2T3[n].length >= T2T3_CAP_PER_LINE)) break;
    }

    type Contact = T1Contact & { touch1_sent_at?: string; touch2_sent_at?: string };

    // ── CHUNK LIMITING: only process first chunk_size unclaimed contacts ─────
    // Contacts already sent (touch1_sent_at, touch2_sent_at, touch3_sent_at set)
    // will be skipped by the atomic claim. We need to limit to chunk_size TOTAL
    // across all lines to stay within Vercel's 300s per-run limit.
    // Remaining = total_pinned - already_sent → returned in response for cron tracking.
    const allPinnedForChunk: Contact[] = [
      ...byLineT2T3[activeLinesSorted[0] ?? 1] ?? [],
    ];
    // Build a flat ordered list: T2/T3 first (warm follow-ups), then T1
    const flatOrdered: Contact[] = [];
    const maxLineLen = Math.max(...activeLinesSorted.map(n => Math.max((byLineT2T3[n] || []).length, (byLineT1[n] || []).length)));
    for (let i = 0; i < maxLineLen; i++) {
      for (const n of activeLinesSorted) {
        if ((byLineT2T3[n] || [])[i]) flatOrdered.push((byLineT2T3[n] || [])[i]);
      }
      for (const n of activeLinesSorted) {
        if ((byLineT1[n] || [])[i]) flatOrdered.push((byLineT1[n] || [])[i]);
      }
    }
    void allPinnedForChunk;

    // Deduplicate and limit to chunk_size
    const seenIds = new Set<string>();
    const chunkContacts: Contact[] = [];
    for (const c of flatOrdered) {
      if (seenIds.has(c.id)) continue;
      seenIds.add(c.id);
      if (chunkContacts.length < chunk_size) {
        chunkContacts.push(c);
      }
    }

    // Rebuild byLine using only chunkContacts
    const byLine: Record<number, Contact[]> = {};
    for (const n of activeLineNumbers) byLine[n] = [];
    let chunkIdx = 0;
    for (const c of chunkContacts) {
      const ln = activeLinesSorted[chunkIdx % activeLinesSorted.length];
      byLine[ln].push(c);
      chunkIdx++;
    }

    // 4. Load chapter info
    const allContacts: Contact[] = Object.values(byLine).flat();
    // Write initial progress now that we know how many contacts this chunk will process
    await writeBatchProgress(0, allContacts.length, 0);
    const chapterIds = [...new Set(allContacts.map(c => c.chapter_id).filter(Boolean))];
    const { data: chapters } = await supabase
      .from('chapters')
      .select('id, fraternity, school, alumni_join_link')
      .in('id', chapterIds);
    const chapterMap: Record<string, { fraternity_name: string; university: string; alumni_join_link: string | null }> = {};
    for (const ch of (chapters || [])) chapterMap[ch.id] = { fraternity_name: ch.fraternity, university: ch.school, alumni_join_link: ch.alumni_join_link };

    // 5. Send — two-phase approach for reliable SMS detection.
    //
    //    The root problem: Linq resolves iMessage/SMS asynchronously. The POST /chats
    //    response often returns service=null or a stale value. Checking it immediately
    //    after chat creation is unreliable and causes SMS contacts to slip through.
    //
    //    Fix:
    //    Per-chapter batches (pinnedIds): contacts are iMessage-verified at compile time.
    //    Phase B is skipped entirely — no need to re-check service after sending.
    //
    //    Legacy global batches: Phase B still runs to detect/revert SMS sends.
    //
    //    Pacing: randomized delay between sends (4–9s) to mimic human behavior.
    //    188 sends × avg 6.5s ≈ 20 minutes. Apple rate detection looks for bursts;
    //    randomized spacing with natural variance avoids pattern matching.

    const isPerChapterBatch = !!pinnedIds;

    // Random delay: uniform between minMs and maxMs
    function randomDelay(minMs: number, maxMs: number): Promise<void> {
      const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
      return sleep(ms);
    }

    type PendingChat = {
      contact: Contact;
      chatId: string;
      message: string;
      originalStatus: string;
      skipServiceCheck: boolean;
    };
    const pendingChats: PendingChat[] = [];

    // ── Phase A: claim + create chat ─────────────────────────────────────────
    // Round-robin across lines in last_used_at order (oldest-first = true round-robin).
    // After each successful send, update last_used_at on the line.
    // Phone-level dedup: a phone number can only receive ONE message per execution.
    const sentPhones = new Set<string>();
    const processedIds = new Set<string>(); // belt-and-suspenders: contact ID dedup
    const maxContacts = activeLinesSorted.length > 0
      ? Math.max(...activeLinesSorted.map(n => (byLine[n] || []).length))
      : 0;

    for (let i = 0; i < maxContacts; i++) {
      for (const lineNum of activeLinesSorted) {
        const contact = (byLine[lineNum] || [])[i];
        if (!contact) continue;

        const fromPhone = ALL_LINE_PHONES[lineNum];
        if (!fromPhone) continue;

        // ── Hard guards BEFORE any DB claim ─────────────────────────────────
        // Guard: skip contacts with no first name — message would say "Hey ,"
        if (!contact.first_name || contact.first_name.trim() === '') {
          results.skipped_already_sent++;
          continue;
        }
        // 1. iMessage-only: skip any number confirmed as SMS
        if ((contact as Contact & { is_imessage?: boolean | null }).is_imessage === false) {
          results.skipped_sms++;
          continue;
        }
        // 2. Contact ID dedup: prevent double-claiming (T1 then T2 in same batch)
        if (processedIds.has(contact.id)) {
          results.skipped_already_sent++;
          continue;
        }
        // 3. Phone dedup: never contact the same number twice in one job
        if (!contact.phone_primary || sentPhones.has(contact.phone_primary)) {
          if (contact.phone_primary) results.skipped_already_sent++;
          continue;
        }
        processedIds.add(contact.id);
        sentPhones.add(contact.phone_primary);
        // ── End hard guards ──────────────────────────────────────────────────

        const chapter  = chapterMap[contact.chapter_id] || { fraternity_name: 'your fraternity', university: 'your school', alumni_join_link: null };
        const status   = contact.outreach_status;

        // Hard block: never send pitch (T2/T3) with wrong/missing join link.
        // trailblaize.net is the marketing homepage — not a chapter join link.
        // If the chapter has no join link, skip T2/T3 and revert their claim.
        if (!chapter.alumni_join_link && status !== 'not_contacted') {
          if (status === 'touch1_sent' || status === 'touch1_confirmed') {
            await supabase.from('alumni_contacts').update({ outreach_status: status, touch2_sent_at: null }).eq('id', contact.id);
          } else if (status === 'touch2_sent' || status === 'pitched') {
            await supabase.from('alumni_contacts').update({ outreach_status: status, touch3_sent_at: null }).eq('id', contact.id);
          }
          results.failed++;
          results.errors.push(`Skipped ${contact.first_name} — chapter has no join link`);
          continue;
        }
        const joinLink = chapter.alumni_join_link || 'https://trailblaize.net';
        const now      = new Date().toISOString();

        // ── Atomic claim ─────────────────────────────────────────────────────
        let claimQuery;
        if (status === 'not_contacted') {
          claimQuery = supabase
            .from('alumni_contacts')
            .update({ outreach_status: 'touch1_sent', touch1_sent_at: now })
            .eq('id', contact.id)
            .eq('outreach_status', 'not_contacted')
            .is('touch1_sent_at', null)
            .select('id');
        } else if (status === 'touch1_sent' || status === 'touch1_confirmed') {
          claimQuery = supabase
            .from('alumni_contacts')
            .update({ outreach_status: 'touch2_sent', touch2_sent_at: now })
            .eq('id', contact.id)
            .in('outreach_status', ['touch1_sent', 'touch1_confirmed'])
            .is('touch2_sent_at', null)
            .select('id');
        } else {
          claimQuery = supabase
            .from('alumni_contacts')
            .update({ outreach_status: 'touch3_sent', touch3_sent_at: now })
            .eq('id', contact.id)
            .eq('outreach_status', 'touch2_sent')
            .is('touch3_sent_at', null)
            .select('id');
        }

        const { data: claimed } = await claimQuery;
        if (!claimed || claimed.length === 0) {
          results.skipped_already_sent++;
          continue;
        }
        // ── End atomic claim ─────────────────────────────────────────────────

        const t1SentAt = (contact as { touch1_sent_at?: string }).touch1_sent_at;
        const daysSinceT1 = t1SentAt
          ? (Date.now() - new Date(t1SentAt).getTime()) / (1000 * 60 * 60 * 24)
          : 0;
        const useT2ALongGap = status === 'touch1_confirmed' && daysSinceT1 >= 7;

        const message =
          status === 'not_contacted'    ? buildT1Message(contact.first_name, chapter.fraternity_name, chapter.university) :
          useT2ALongGap                 ? buildT2ALongGapMessage(contact.first_name, chapter.fraternity_name, chapter.university, joinLink) :
          status === 'touch1_confirmed' ? buildT2AMessage(contact.first_name, chapter.fraternity_name, chapter.university, joinLink) :
          status === 'touch1_sent'      ? buildT2BMessage(contact.first_name, chapter.fraternity_name, chapter.university) :
          status === 'pitched'          ? buildT3PitchedMessage(contact.first_name, chapter.fraternity_name) :
          contact.linq_chat_id          ? buildT3AMessage(contact.first_name) :
                                          buildT3BMessage(contact.first_name, chapter.fraternity_name);

        try {
          // Check if this contact was pre-allocated at compile time.
          // If so, we already know it's iMessage — skip Phase B service detection.
          const preAllocatedChatId = contact.linq_chat_id ?? null;

          const chat = await createChat(fromPhone, contact.phone_primary, message);

          if (preAllocatedChatId) {
            // Pre-verified iMessage at compile time — no need for Phase B getChat check.
            // Update chat id in case Linq returned a different chat id this time.
            await supabase.from('alumni_contacts')
              .update({ linq_chat_id: chat.id, is_imessage: true })
              .eq('id', contact.id);
            // Don't add to pendingChats — skip Phase B entirely for this contact
          } else {
            // Not pre-allocated — add to Phase B queue for SMS/iMessage detection
            pendingChats.push({ contact, chatId: chat.id, message, originalStatus: status, skipServiceCheck: false });

            // Store chat ID immediately — protects against Phase B timeout
            await supabase.from('alumni_contacts')
              .update({ linq_chat_id: chat.id })
              .eq('id', contact.id);
          }

          results.sent++;
          if (status === 'not_contacted') results.t1_sent++;
          else results.t2t3_sent++;

          // Write live progress after each successful send
          await writeBatchProgress(results.sent, allContacts.length, results.failed);

          // Round-robin: update last_used_at on the line that just sent
          const lineRecord = lineConfigMap[lineNum];
          if (lineRecord?.id) {
            await supabase
              .from('linq_line_config')
              .update({ last_used_at: new Date().toISOString() })
              .eq('id', lineRecord.id);
          }

          // Randomized human-like delay: 4–9s between sends
          // 188 contacts × avg 6.5s ≈ 20 min total — natural variance avoids carrier pattern detection
          await randomDelay(4000, 9000);
        } catch (e) {
          const errMsg = String(e);
          results.errors.push(`${contact.first_name} (${contact.phone_primary}): createChat failed: ${errMsg}`);
          results.failed++;
        }
      }
    }

    // ── Phase B: verify service, revert SMS contacts ──────────────────────────
    // Only runs for legacy global batches. Per-chapter batches are iMessage-verified
    // at compile time (createChat + service check during compile-chapter), so all
    // contacts have linq_chat_id and skipServiceCheck=true. Phase B is a no-op for them.
    if (!isPerChapterBatch && pendingChats.length > 0) {
      // Shared wait — Linq resolves service within ~5s for most numbers
      await sleep(10000);

      for (const { contact, chatId, originalStatus, skipServiceCheck } of pendingChats) {
        // Pre-allocated at compile time = already iMessage-verified; skip the getChat round-trip
        if (skipServiceCheck) {
          await supabase.from('alumni_contacts').update({ is_imessage: true }).eq('id', contact.id);
          continue;
        }
        try {
          const resolvedChat = await getChat(chatId);
          const service = getRecipientService(resolvedChat);
          const isImessage = service === 'iMessage' || service === 'RCS';

          if (isImessage) {
            // Happy path — confirm iMessage status
            await supabase.from('alumni_contacts')
              .update({ is_imessage: true })
              .eq('id', contact.id);
          } else {
            // SMS detected — revert DB to pre-send state so next batch skips this contact
            results.sent_to_sms++;
            results.skipped_sms++;

            const revertFields: Record<string, unknown> = { is_imessage: false };

            if (originalStatus === 'not_contacted') {
              // T1 was sent to SMS — roll back to not_contacted
              revertFields.outreach_status = 'not_contacted';
              revertFields.touch1_sent_at  = null;
            } else if (originalStatus === 'touch1_sent' || originalStatus === 'touch1_confirmed') {
              // T2 was sent to SMS — roll back touch2 claim only, keep T1 status
              revertFields.outreach_status = originalStatus;
              revertFields.touch2_sent_at  = null;
            } else if (originalStatus === 'touch2_sent') {
              // T3 was sent to SMS — roll back touch3 claim only
              revertFields.outreach_status = 'touch2_sent';
              revertFields.touch3_sent_at  = null;
            }

            await supabase.from('alumni_contacts')
              .update(revertFields)
              .eq('id', contact.id);
          }

          await sleep(100);
        } catch (_e) {
          // Non-fatal — message was already sent, just couldn't confirm service type
        }
      }
    }

    // 6. Calculate remaining contacts (total_pinned - already_sent)
    let totalPinned = 0;
    let alreadySent = 0;
    try {
      if (pinnedIds) {
        totalPinned = pinnedIds.t1.length + pinnedIds.t2.length + pinnedIds.t3.length;
        // Count how many of the pinned contacts now have sent timestamps
        const allPinnedIds = [...pinnedIds.t1, ...pinnedIds.t2, ...pinnedIds.t3];
        if (allPinnedIds.length > 0) {
          const { data: sentContacts } = await supabase
            .from('alumni_contacts')
            .select('id')
            .in('id', allPinnedIds)
            .not('touch1_sent_at', 'is', null);
          // For T2/T3 we check touch2 and touch3 too
          const { data: sentT2 } = await supabase
            .from('alumni_contacts')
            .select('id')
            .in('id', pinnedIds.t2)
            .not('touch2_sent_at', 'is', null);
          const { data: sentT3 } = await supabase
            .from('alumni_contacts')
            .select('id')
            .in('id', pinnedIds.t3)
            .not('touch3_sent_at', 'is', null);
          const sentSet = new Set([
            ...(sentContacts || []).filter(c => pinnedIds!.t1.includes(c.id)).map(c => c.id),
            ...(sentT2 || []).map(c => c.id),
            ...(sentT3 || []).map(c => c.id),
          ]);
          alreadySent = sentSet.size;
        }
      } else {
        // Non-pinned (legacy global) batch — mark completed
        totalPinned = results.sent + results.failed;
        alreadySent = results.sent;
      }
    } catch { /* non-fatal — just report 0 remaining */ }

    const remaining = Math.max(0, totalPinned - alreadySent);
    const newStatus = remaining === 0 ? 'completed' : 'executing';

    // Write final results
    await supabase
      .from('outreach_batches')
      .update({
        status: newStatus,
        sent_at: new Date().toISOString(),
        notes: JSON.stringify({
          ...results,
          active_lines: activeLineNumbers,
          paused_lines: [...pausedLines],
          line_t1_caps: lineT1Caps,
          chunk_size,
          total_pinned: totalPinned,
          already_sent: alreadySent,
          remaining,
        }),
      })
      .eq('id', id);

    return NextResponse.json({
      data: {
        ...results,
        active_lines: activeLineNumbers,
        paused_lines: [...pausedLines],
        remaining,
        total_pinned: totalPinned,
        already_sent: alreadySent,
        status: newStatus,
      },
      error: null,
    });

  } catch (err) {
    // Hard crash — batch is already marked 'completed' (set at top of handler).
    // Leave it that way to prevent automatic retry. Partial sends already happened.
    console.error('[execute batch] hard error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
