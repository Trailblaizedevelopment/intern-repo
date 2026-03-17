import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { createChat, getChat, getRecipientService, sleep } from '@/lib/linq';

// Vercel Pro: allow up to 300s for this route (batch sends take time)
export const maxDuration = 300;

const ALL_LINE_PHONES: Record<number, string> = {
  1: '+16462408056', // Owen
  2: '+16462668785', // Adam
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
  return `Hey ${firstName}, is this you? Just verifying we have the right number for the ${fraternityName} alumni list at ${school}.`;
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

// Track B — no response to T1 (touch1_sent, 2+ days)
function buildT2BMessage(firstName: string, fraternityName: string, school: string, joinLink: string): string {
  return `Hey ${firstName}, just following up - we're building out the ${fraternityName} alumni network at ${school}. Here's the link if you're interested: ${joinLink}`;
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

  // 1. Fetch and verify batch — status must be 'approved'
  const { data: batch, error: bErr } = await supabase
    .from('outreach_batches')
    .select('*')
    .eq('id', id)
    .single();

  if (bErr || !batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  if (batch.status !== 'approved') {
    return NextResponse.json({
      error: `Cannot execute: batch status is '${batch.status}' (must be 'approved'). Each batch can only be executed once.`
    }, { status: 409 });
  }

  // Immediately mark the batch as 'completed' to prevent a second Execute click
  // from racing through. We'll overwrite with real results at the end.
  // If we crash before that, the batch stays 'completed' — intentional, use a new batch to retry.
  await supabase
    .from('outreach_batches')
    .update({ status: 'completed', sent_at: new Date().toISOString(), notes: 'Executing…' })
    .eq('id', id);

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
    // 2. Check paused lines — fetch full config including warm-up fields
    const { data: lineConfigs } = await supabase
      .from('linq_line_config')
      .select('line_number, is_paused, label, daily_limit, is_warmed_up, warmup_start_date');

    type LineConfig = {
      line_number: number;
      is_paused: boolean;
      label: string;
      daily_limit: number;
      is_warmed_up: boolean | null;
      warmup_start_date: string | null;
    };

    const lineConfigMap: Record<number, LineConfig> = {};
    for (const lc of (lineConfigs || []) as LineConfig[]) {
      lineConfigMap[lc.line_number] = lc;
    }

    const pausedLines = new Set(
      (lineConfigs || []).filter((l: LineConfig) => l.is_paused).map((l: LineConfig) => l.line_number)
    );
    const activeLineNumbers = [1, 2, 3].filter(n => !pausedLines.has(n));

    if (activeLineNumbers.length === 0) {
      await supabase.from('outreach_batches').update({
        status: 'approved',
        sent_at: null,
        notes: 'Rolled back — all lines are paused.',
      }).eq('id', id);
      return NextResponse.json({ error: 'All lines are paused — resume at least one line first.' }, { status: 409 });
    }

    // Build per-line T1 cap using warm-up logic
    const lineT1Caps: Record<number, number> = {};
    for (const n of activeLineNumbers) {
      const lc = lineConfigMap[n];
      lineT1Caps[n] = lc
        ? getLineT1Cap(lc)
        : T1_CAP_PER_LINE;
    }

    // 3. Load eligible contacts — two separate pools with separate caps
    //    Safety filters on timestamp fields prevent re-selecting already-processed contacts
    //    even if status somehow got out of sync.
    const cutoffT3 = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();

    // T1 chapter-priority ordering: chapters with the most not_contacted contacts
    // get T1 slots first, preventing large chapters from being starved by small ones.
    const totalT1Cap = activeLineNumbers.reduce((sum, n) => sum + lineT1Caps[n], 0) + 50;

    type T1Contact = {
      id: string;
      first_name: string;
      phone_primary: string | null;
      chapter_id: string;
      outreach_status: string;
      is_imessage: boolean | null;
      linq_chat_id: string | null;
    };

    // Step 1: count not_contacted per chapter (lightweight — only chapter_id)
    const { data: countRows } = await supabase
      .from('alumni_contacts')
      .select('chapter_id')
      .eq('outreach_status', 'not_contacted')
      .is('touch1_sent_at', null)
      .is('linq_chat_id', null)
      .not('is_imessage', 'is', false)
      .not('flagged', 'is', true)
      .not('phone_primary', 'is', null);

    // Sort chapters by count descending
    const countByChapter: Record<string, number> = {};
    for (const row of (countRows || [])) {
      countByChapter[row.chapter_id] = (countByChapter[row.chapter_id] || 0) + 1;
    }
    const prioritizedChapterIds = Object.entries(countByChapter)
      .sort((a, b) => b[1] - a[1])
      .map(([cid]) => cid);

    // Step 2: fetch full contact records per chapter in priority order, up to cap
    const t1ContactsOrdered: T1Contact[] = [];
    for (const chId of prioritizedChapterIds) {
      if (t1ContactsOrdered.length >= totalT1Cap) break;
      const remaining = totalT1Cap - t1ContactsOrdered.length;
      const { data: chContacts } = await supabase
        .from('alumni_contacts')
        .select('id, first_name, phone_primary, chapter_id, outreach_status, is_imessage, linq_chat_id')
        .eq('chapter_id', chId)
        .eq('outreach_status', 'not_contacted')
        .is('touch1_sent_at', null)
        .is('linq_chat_id', null)
        .not('is_imessage', 'is', false)
        .not('flagged', 'is', true)
        .not('phone_primary', 'is', null)
        .order('created_at', { ascending: true })
        .limit(remaining);
      if (chContacts) t1ContactsOrdered.push(...(chContacts as T1Contact[]));
    }

    const [t2Res, t3Res] = await Promise.all([
      // T2: touch1_sent (2+ days old) OR touch1_confirmed (replied — no wait required), no T2 yet
      supabase
        .from('alumni_contacts')
        .select('id, first_name, phone_primary, chapter_id, outreach_status, is_imessage, touch1_sent_at, linq_chat_id')
        .in('outreach_status', ['touch1_sent', 'touch1_confirmed'])
        .is('touch2_sent_at', null)
        .not('is_imessage', 'is', false)
        .not('flagged', 'is', true)
        .not('phone_primary', 'is', null)
        .limit(activeLineNumbers.length * T2T3_CAP_PER_LINE + 50),
      // T3: touch2 sent, 4+ days old, no T3 sent yet
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

    const t1Pool   = t1ContactsOrdered;
    const t2t3Pool = [...(t2Res.data || []), ...(t3Res.data || [])];

    // Distribute T1 round-robin — per-line warm-up-aware cap
    const byLineT1: Record<number, typeof t1Pool> = {};
    for (const n of activeLineNumbers) byLineT1[n] = [];
    let idx = 0;
    for (const c of t1Pool) {
      const ln = activeLineNumbers[idx % activeLineNumbers.length];
      if (byLineT1[ln].length < lineT1Caps[ln]) byLineT1[ln].push(c);
      idx++;
      if (activeLineNumbers.every(n => byLineT1[n].length >= lineT1Caps[n])) break;
    }

    // Distribute T2/T3 round-robin — 150/line cap
    const byLineT2T3: Record<number, typeof t2t3Pool> = {};
    for (const n of activeLineNumbers) byLineT2T3[n] = [];
    idx = 0;
    for (const c of t2t3Pool) {
      const ln = activeLineNumbers[idx % activeLineNumbers.length];
      if (byLineT2T3[ln].length < T2T3_CAP_PER_LINE) byLineT2T3[ln].push(c);
      idx++;
      if (activeLineNumbers.every(n => byLineT2T3[n].length >= T2T3_CAP_PER_LINE)) break;
    }

    type Contact = T1Contact | NonNullable<typeof t2Res.data>[0] | NonNullable<typeof t3Res.data>[0];
    const byLine: Record<number, Contact[]> = {};
    for (const n of activeLineNumbers) {
      byLine[n] = [...byLineT2T3[n], ...byLineT1[n]]; // warm follow-ups first
    }

    // 4. Load chapter info
    const allContacts: Contact[] = Object.values(byLine).flat();
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
    //    Phase A — atomically claim each contact, create a Linq chat with message.
    //              Lines are processed SEQUENTIALLY with a 2-minute gap between them.
    //              3-second sleep between sends within each line (rate limit protection).
    //    Phase B — after a shared 10-second wait, GET each chat to read the resolved
    //              service, then REVERT SMS contacts back to their pre-send DB state.
    //              SMS chats are tracked as sent_to_sms (message was sent but we revert
    //              status so the next batch can detect and handle properly).

    type PendingChat = {
      contact: Contact;
      chatId: string;
      message: string;
      originalStatus: string;
    };
    const pendingChats: PendingChat[] = [];

    // ── Phase A: claim + create chat ─────────────────────────────────────────
    // Round-robin across lines (Line1 → Line2 → Line1 → Line2...) with 1.5s
    // between each send. NO inter-line sleep — that caused serverless timeouts.
    // Phone-level dedup: a phone number can only receive ONE message per execution.
    const sentPhones = new Set<string>();
    const processedIds = new Set<string>(); // belt-and-suspenders: contact ID dedup
    const maxContacts = activeLineNumbers.length > 0
      ? Math.max(...activeLineNumbers.map(n => (byLine[n] || []).length))
      : 0;

    for (let i = 0; i < maxContacts; i++) {
      for (const lineNum of activeLineNumbers) {
        const contact = (byLine[lineNum] || [])[i];
        if (!contact) continue;

        const fromPhone = ALL_LINE_PHONES[lineNum];
        if (!fromPhone) continue;

        // ── Hard guards BEFORE any DB claim ─────────────────────────────────
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
        const joinLink = chapter.alumni_join_link || 'https://trailblaize.net';
        const status   = contact.outreach_status;
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
          status === 'touch1_sent'      ? buildT2BMessage(contact.first_name, chapter.fraternity_name, chapter.university, joinLink) :
          contact.linq_chat_id          ? buildT3AMessage(contact.first_name) :
                                          buildT3BMessage(contact.first_name, chapter.fraternity_name);

        try {
          const chat = await createChat(fromPhone, contact.phone_primary, message);
          pendingChats.push({ contact, chatId: chat.id, message, originalStatus: status });

          // Store chat ID immediately — protects against Phase B timeout
          await supabase.from('alumni_contacts')
            .update({ linq_chat_id: chat.id })
            .eq('id', contact.id);

          results.sent++;
          if (status === 'not_contacted') results.t1_sent++;
          else results.t2t3_sent++;

          // 1.5s between sends — enough spacing without blowing the timeout budget
          await sleep(1500);
        } catch (e) {
          const errMsg = String(e);
          results.errors.push(`${contact.first_name} (${contact.phone_primary}): createChat failed: ${errMsg}`);
          results.failed++;
        }
      }
    }

    // ── Phase B: verify service, revert SMS contacts ──────────────────────────
    // Phase A already sent messages. This phase reads back the resolved service
    // type from Linq and REVERTS SMS contacts to their pre-send DB state so they
    // can be properly handled in future runs.
    if (pendingChats.length > 0) {
      // Shared wait — Linq resolves service within ~5s for most numbers
      await sleep(10000);

      for (const { contact, chatId, originalStatus } of pendingChats) {
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

    // 6. Write final results
    await supabase
      .from('outreach_batches')
      .update({
        status: 'completed',
        sent_at: new Date().toISOString(),
        notes: JSON.stringify({
          ...results,
          active_lines: activeLineNumbers,
          paused_lines: [...pausedLines],
          line_t1_caps: lineT1Caps,
        }),
      })
      .eq('id', id);

    return NextResponse.json({
      data: { ...results, active_lines: activeLineNumbers, paused_lines: [...pausedLines] },
      error: null,
    });

  } catch (err) {
    // Hard crash — batch is already marked 'completed' (set at top of handler).
    // Leave it that way to prevent automatic retry. Partial sends already happened.
    console.error('[execute batch] hard error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
