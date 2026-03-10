import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { createChat, getRecipientService, sleep } from '@/lib/linq';

const ALL_LINE_PHONES: Record<number, string> = {
  1: '+16462408056', // Owen
  2: '+16462668785', // Adam
  3: '+16462442696', // Ford
};

const CHAPTER_JOIN_LINKS: Record<string, string> = {
  'c15ddcc2-341b-459a-b508-16aa65d56d8f': 'https://www.trailblaize.net/alumni-join/dFxw7fYkiK8dUCl8xwC7UFbuMwIC3Fpt',
  '57dde7fc-e048-430b-b872-b1baedda0263': 'https://www.trailblaize.net/join/9LiZS3SVKrvBCM8N6QLvgsoMW3undNn5',
  'a2cc8a73-ec38-489c-b6f0-640871293fda': 'https://www.trailblaize.net/alumni-join/DGY5vgkFAve9DKC0Azcg6hu4XFCJtdJC',
};

// Per-line caps:
// T1 (new chats)     — strict Linq daily limit, never exceed 45
// T2/T3 (follow-ups) — existing open threads, safe to do more; cap at 150
const T1_CAP_PER_LINE   = 45;
const T2T3_CAP_PER_LINE = 150;

function buildT1Message(firstName: string, fraternityName: string, school: string, joinLink: string): string {
  return `Hey ${firstName}! Reaching out on behalf of ${fraternityName} at ${school}. We're rebuilding our alumni network and would love to have you involved. Join here: ${joinLink} - takes 2 min!`;
}

function buildT2Message(firstName: string, fraternityName: string): string {
  return `Hey ${firstName}, just following up! Wanted to make sure you saw our message about the ${fraternityName} alumni network. Would love to get you connected - interested?`;
}

function buildT3Message(firstName: string, fraternityName: string): string {
  return `Hey ${firstName} - last follow-up from us. Still happy to get you connected to the ${fraternityName} alumni network on Trailblaize if you're interested. Totally free, takes 30 sec.`;
}

/**
 * POST /api/outreach/batches/[id]/execute
 * Executes actual Linq sends for an approved batch.
 *
 * Caps:
 *   - T1 new chats:        45/active line  (Linq daily new-chat limit)
 *   - T2/T3 follow-ups:   150/active line  (existing threads, no daily cap risk)
 *
 * - Paused lines (linq_line_config.is_paused) are always skipped
 * - Status must be 'approved' — prevents double-runs
 * - Rolls back to 'approved' on hard failure so it can be retried
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
    return NextResponse.json({ error: `Cannot execute: batch status is '${batch.status}' (must be 'approved')` }, { status: 409 });
  }

  const results = { sent: 0, failed: 0, skipped_sms: 0, skipped_paused_line: 0, t1_sent: 0, t2t3_sent: 0, errors: [] as string[] };

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
      await supabase.from('outreach_batches').update({ status: 'approved' }).eq('id', id);
      return NextResponse.json({ error: 'All lines are paused — resume at least one line first.' }, { status: 409 });
    }

    // 3. Load eligible contacts — two separate pools with different caps
    const cutoffT2 = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago
    const cutoffT3 = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(); // 4 days ago

    const [t1Res, t2Res, t3Res] = await Promise.all([
      // T1: brand new contacts
      supabase
        .from('alumni_contacts')
        .select('id, first_name, phone_primary, chapter_id, outreach_status, is_imessage')
        .eq('outreach_status', 'not_contacted')
        .neq('is_imessage', false)
        .not('phone_primary', 'is', null)
        .limit(activeLineNumbers.length * T1_CAP_PER_LINE + 50),
      // T2: touch1_sent and 2+ days have passed
      supabase
        .from('alumni_contacts')
        .select('id, first_name, phone_primary, chapter_id, outreach_status, is_imessage, touch1_sent_at')
        .eq('outreach_status', 'touch1_sent')
        .neq('is_imessage', false)
        .lte('touch1_sent_at', cutoffT2)
        .not('phone_primary', 'is', null)
        .limit(activeLineNumbers.length * T2T3_CAP_PER_LINE + 50),
      // T3: touch2_sent and 4+ days have passed
      supabase
        .from('alumni_contacts')
        .select('id, first_name, phone_primary, chapter_id, outreach_status, is_imessage, touch2_sent_at')
        .eq('outreach_status', 'touch2_sent')
        .neq('is_imessage', false)
        .lte('touch2_sent_at', cutoffT3)
        .not('phone_primary', 'is', null)
        .limit(activeLineNumbers.length * T2T3_CAP_PER_LINE + 50),
    ]);

    const t1Pool   = t1Res.data   || [];
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

    // Merge per line: T2/T3 first (warm follow-ups priority), then T1 new
    type Contact = typeof t1Pool[0] | typeof t2t3Pool[0];
    const byLine: Record<number, Contact[]> = {};
    for (const n of activeLineNumbers) {
      byLine[n] = [...byLineT2T3[n], ...byLineT1[n]];
    }

    // 4. Load chapter info
    const allContacts: Contact[] = Object.values(byLine).flat();
    const chapterIds = [...new Set(allContacts.map(c => c.chapter_id).filter(Boolean))];
    const { data: chapters } = await supabase
      .from('chapters')
      .select('id, fraternity_name, university')
      .in('id', chapterIds);
    const chapterMap: Record<string, { fraternity_name: string; university: string }> = {};
    for (const ch of (chapters || [])) chapterMap[ch.id] = ch;

    // 5. Send via Linq — active lines only, T2/T3 before T1 per line
    for (const [lineNum, contacts] of Object.entries(byLine)) {
      const fromPhone = ALL_LINE_PHONES[Number(lineNum)];
      if (!fromPhone) continue;

      for (const contact of contacts) {
        const chapter  = chapterMap[contact.chapter_id] || { fraternity_name: 'your fraternity', university: 'your school' };
        const joinLink = CHAPTER_JOIN_LINKS[contact.chapter_id] || 'https://trailblaize.net';
        const status   = contact.outreach_status;

        const message =
          status === 'not_contacted' ? buildT1Message(contact.first_name, chapter.fraternity_name, chapter.university, joinLink) :
          status === 'touch2_sent'   ? buildT3Message(contact.first_name, chapter.fraternity_name) :
                                       buildT2Message(contact.first_name, chapter.fraternity_name);

        try {
          const chat    = await createChat(fromPhone, contact.phone_primary, message);
          const service = getRecipientService(chat);

          if (service === 'SMS') {
            await supabase.from('alumni_contacts').update({ is_imessage: false }).eq('id', contact.id);
            results.skipped_sms++;
            continue;
          }

          const now = new Date().toISOString();
          const update =
            status === 'not_contacted' ? { outreach_status: 'touch1_sent', touch1_sent_at: now, linq_chat_id: chat.id } :
            status === 'touch2_sent'   ? { outreach_status: 'touch3_sent', touch3_sent_at: now } :
                                         { outreach_status: 'touch2_sent', touch2_sent_at: now };

          await supabase.from('alumni_contacts').update(update).eq('id', contact.id);
          results.sent++;
          if (status === 'not_contacted') results.t1_sent++;
          else results.t2t3_sent++;

          await sleep(300);
        } catch (e) {
          results.errors.push(`${contact.first_name} (${contact.phone_primary}): ${String(e)}`);
          results.failed++;
        }
      }
    }

    // 6. Mark complete — write results to notes (JSON) until schema migration adds results column
    await supabase
      .from('outreach_batches')
      .update({
        status: 'completed',
        sent_at: new Date().toISOString(),
        notes: JSON.stringify({ ...results, active_lines: activeLineNumbers, paused_lines: [...pausedLines] }),
      })
      .eq('id', id);

    return NextResponse.json({
      data: {
        ...results,
        active_lines: activeLineNumbers,
        paused_lines: [...pausedLines],
      },
      error: null,
    });

  } catch (err) {
    await supabase.from('outreach_batches').update({ status: 'approved' }).eq('id', id);
    console.error('[execute batch] hard error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
