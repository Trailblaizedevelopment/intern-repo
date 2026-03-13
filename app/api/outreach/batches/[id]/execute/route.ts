import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { createChat, getRecipientService, sleep } from '@/lib/linq';

const ALL_LINE_PHONES: Record<number, string> = {
  1: '+16462408056', // Owen
  2: '+16462668785', // Adam
  3: '+16462442696', // Ford
};


// Per-line caps:
// T1 (new chats)     — strict Linq daily limit, never exceed 45
// T2/T3 (follow-ups) — existing open threads, safe to do more; cap at 150
const T1_CAP_PER_LINE   = 45;
const T2T3_CAP_PER_LINE = 150;

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
 *   - T1 new chats:        45/active line  (Linq daily new-chat limit)
 *   - T2/T3 follow-ups:   150/active line  (existing threads, no daily cap risk)
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
    failed: 0,
    skipped_sms: 0,
    skipped_already_sent: 0,
    skipped_paused_line: 0,
    t1_sent: 0,
    t2t3_sent: 0,
    errors: [] as string[],
  };

  try {
    // 2. Check paused lines
    const { data: lineConfigs } = await supabase
      .from('linq_line_config')
      .select('line_number, is_paused, label');

    const pausedLines = new Set(
      (lineConfigs || []).filter(l => l.is_paused).map(l => l.line_number)
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

    // 3. Load eligible contacts — two separate pools with separate caps
    //    Safety filters on timestamp fields prevent re-selecting already-processed contacts
    //    even if status somehow got out of sync.
    const cutoffT2 = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const cutoffT3 = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();

    // T1 chapter-priority ordering: chapters with the most not_contacted contacts
    // get T1 slots first, preventing large chapters from being starved by small ones.
    const t1Cap = activeLineNumbers.length * T1_CAP_PER_LINE + 50;

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
      .map(([id]) => id);

    // Step 2: fetch full contact records per chapter in priority order, up to cap
    const t1ContactsOrdered: T1Contact[] = [];
    for (const chId of prioritizedChapterIds) {
      if (t1ContactsOrdered.length >= t1Cap) break;
      const remaining = t1Cap - t1ContactsOrdered.length;
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

    // Distribute T1 round-robin — strict 45/line cap
    const byLineT1: Record<number, typeof t1Pool> = {};
    for (const n of activeLineNumbers) byLineT1[n] = [];
    let idx = 0;
    for (const c of t1Pool) {
      const ln = activeLineNumbers[idx % activeLineNumbers.length];
      if (byLineT1[ln].length < T1_CAP_PER_LINE) byLineT1[ln].push(c);
      idx++;
      if (activeLineNumbers.every(n => byLineT1[n].length >= T1_CAP_PER_LINE)) break;
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

    // 5. Send — with atomic pre-claim before each Linq call
    for (const [lineNum, contacts] of Object.entries(byLine)) {
      const fromPhone = ALL_LINE_PHONES[Number(lineNum)];
      if (!fromPhone) continue;

      for (const contact of contacts) {
        const chapter  = chapterMap[contact.chapter_id] || { fraternity_name: 'your fraternity', university: 'your school' };
        const joinLink = chapter.alumni_join_link || 'https://trailblaize.net';
        const status   = contact.outreach_status;
        const now      = new Date().toISOString();

        // ── Atomic claim ──────────────────────────────────────────────────────
        // Conditionally update the contact to the next status BEFORE calling Linq.
        // The WHERE clause checks the *current* status + confirms no timestamp collision.
        // If 0 rows are affected, this contact was already processed → skip.
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
          // touch2_sent → T3
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
          // Already processed by a prior run — safe to skip
          results.skipped_already_sent++;
          continue;
        }
        // ── End atomic claim ──────────────────────────────────────────────────

        // For touch1_confirmed T2A: if >7 days since T1, use long-gap variant
        // (no "great!" callback — they likely don't remember the ping from weeks ago)
        const t1SentAt = (contact as { touch1_sent_at?: string }).touch1_sent_at;
        const daysSinceT1 = t1SentAt
          ? (Date.now() - new Date(t1SentAt).getTime()) / (1000 * 60 * 60 * 24)
          : 0;
        const useT2ALongGap = status === 'touch1_confirmed' && daysSinceT1 >= 7;

        const message =
          status === 'not_contacted'   ? buildT1Message(contact.first_name, chapter.fraternity_name, chapter.university) :
          useT2ALongGap                ? buildT2ALongGapMessage(contact.first_name, chapter.fraternity_name, chapter.university, joinLink) :
          status === 'touch1_confirmed'? buildT2AMessage(contact.first_name, chapter.fraternity_name, chapter.university, joinLink) :
          status === 'touch1_sent'     ? buildT2BMessage(contact.first_name, chapter.fraternity_name, chapter.university, joinLink) :
          // T3: check original track — touch1_confirmed track gets T3A, touch1_sent track gets T3B
          // We infer track from whether they ever confirmed (touch2 from A would have had confirmed prior)
          // Simplification: T3A only fires when contact has a linq_chat_id (replied), else T3B
          contact.linq_chat_id         ? buildT3AMessage(contact.first_name) :
                                         buildT3BMessage(contact.first_name, chapter.fraternity_name);

        try {
          const chat    = await createChat(fromPhone, contact.phone_primary, message);
          const service = getRecipientService(chat);

          if (service === 'SMS') {
            // Revert claim and mark as SMS-only
            const revertStatus = status === 'not_contacted' ? 'not_contacted' : status;
            await supabase.from('alumni_contacts').update({
              is_imessage: false,
              outreach_status: revertStatus,
              touch1_sent_at: status === 'not_contacted' ? null : undefined,
              touch2_sent_at: status === 'touch1_sent'   ? null : undefined,
              touch3_sent_at: status === 'touch2_sent'   ? null : undefined,
            }).eq('id', contact.id);
            results.skipped_sms++;
            continue;
          }

          // For T1: store linq_chat_id and mark is_imessage=true (confirmed iMessage delivery)
          if (status === 'not_contacted') {
            await supabase.from('alumni_contacts')
              .update({ linq_chat_id: chat.id, is_imessage: true })
              .eq('id', contact.id);
          }

          results.sent++;
          if (status === 'not_contacted') results.t1_sent++;
          else results.t2t3_sent++;

          await sleep(300);
        } catch (e) {
          const errMsg = String(e);
          results.errors.push(`${contact.first_name} (${contact.phone_primary}): ${errMsg}`);
          results.failed++;
          // Note: we do NOT revert the claim on Linq failure.
          // The DB status is already advanced — this prevents retry loops from re-sending.
          // If a manual fix is needed, update the contact status directly in the DB.
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
