import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { createChat, getRecipientService, sleep } from '@/lib/linq';

// Owen's line is ALWAYS blocked — flagged read-only by Apple
const ALWAYS_BLOCKED_PHONES = new Set(['+16462408056']);

const ALL_LINE_PHONES: Record<number, string> = {
  1: '+16462408056', // Owen — always blocked
  2: '+16462668785', // Adam
  3: '+16462442696', // Ford
};

const CHAPTER_JOIN_LINKS: Record<string, string> = {
  'c15ddcc2-341b-459a-b508-16aa65d56d8f': 'https://www.trailblaize.net/alumni-join/dFxw7fYkiK8dUCl8xwC7UFbuMwIC3Fpt',
  '57dde7fc-e048-430b-b872-b1baedda0263': 'https://www.trailblaize.net/join/9LiZS3SVKrvBCM8N6QLvgsoMW3undNn5',
  'a2cc8a73-ec38-489c-b6f0-640871293fda': 'https://www.trailblaize.net/alumni-join/DGY5vgkFAve9DKC0Azcg6hu4XFCJtdJC',
};

function buildT1Message(firstName: string, fraternityName: string, school: string, joinLink: string): string {
  return `Hey ${firstName}! Reaching out on behalf of ${fraternityName} at ${school}. We're rebuilding our alumni network and would love to have you involved. Join here: ${joinLink} - takes 2 min!`;
}

function buildT2Message(firstName: string, fraternityName: string): string {
  return `Hey ${firstName}, just following up! Wanted to make sure you saw our message about the ${fraternityName} alumni network. Would love to get you connected - interested?`;
}

/**
 * POST /api/outreach/batches/[id]/execute
 * Executes actual Linq sends for an approved batch.
 * - Respects linq_line_config pause state (paused lines are skipped)
 * - Always blocks Owen's line
 * - Atomically locks to 'sending' before any sends to prevent double-runs
 * - Rolls back to 'approved' on hard failure so it can be retried
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  // 1. Fetch and verify batch
  const { data: batch, error: bErr } = await supabase
    .from('outreach_batches')
    .select('*')
    .eq('id', id)
    .single();

  if (bErr || !batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  if (batch.status !== 'approved') {
    return NextResponse.json({ error: `Cannot execute: batch status is '${batch.status}' (must be 'approved')` }, { status: 409 });
  }

  // 2. Lock to 'sending' atomically — prevents double-runs
  const { error: lockErr } = await supabase
    .from('outreach_batches')
    .update({ status: 'sending' })
    .eq('id', id)
    .eq('status', 'approved');

  if (lockErr) return NextResponse.json({ error: 'Failed to lock batch' }, { status: 500 });

  const results = { sent: 0, failed: 0, skipped_sms: 0, skipped_paused_line: 0, errors: [] as string[] };

  try {
    // 3. Check which lines are paused in linq_line_config
    const { data: lineConfigs } = await supabase
      .from('linq_line_config')
      .select('line_number, is_paused, label');

    const pausedLines = new Set(
      (lineConfigs || []).filter(l => l.is_paused).map(l => l.line_number)
    );

    // Build active line numbers: not Owen's blocked phone, not paused
    const activeLineNumbers = [1, 2, 3].filter(n => {
      const phone = ALL_LINE_PHONES[n];
      return !ALWAYS_BLOCKED_PHONES.has(phone) && !pausedLines.has(n);
    });

    if (activeLineNumbers.length === 0) {
      await supabase.from('outreach_batches').update({ status: 'approved' }).eq('id', id);
      return NextResponse.json({ error: 'All lines are paused or blocked — no sends executed. Resume a line first.' }, { status: 409 });
    }

    // 4. Load eligible contacts for active lines only
    const cutoffT2 = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    const [t1Res, t2Res] = await Promise.all([
      supabase
        .from('alumni_contacts')
        .select('id, first_name, phone_primary, chapter_id, assigned_line, outreach_status, is_imessage')
        .eq('outreach_status', 'not_contacted')
        .eq('is_imessage', true)
        .in('assigned_line', activeLineNumbers)
        .limit(200),
      supabase
        .from('alumni_contacts')
        .select('id, first_name, phone_primary, chapter_id, assigned_line, outreach_status, is_imessage, touch1_sent_at')
        .eq('outreach_status', 'touch1_sent')
        .eq('is_imessage', true)
        .lte('touch1_sent_at', cutoffT2)
        .in('assigned_line', activeLineNumbers)
        .limit(200),
    ]);

    const allContacts = [...(t1Res.data || []), ...(t2Res.data || [])];

    // Cap at 45 per active line
    const byLine: Record<number, typeof allContacts> = {};
    for (const n of activeLineNumbers) byLine[n] = [];
    for (const c of allContacts) {
      const line = c.assigned_line as number;
      if (byLine[line] !== undefined && byLine[line].length < 45) byLine[line].push(c);
    }

    // Load chapter names + fraternity info
    const chapterIds = [...new Set(allContacts.map(c => c.chapter_id).filter(Boolean))];
    const { data: chapters } = await supabase
      .from('chapters')
      .select('id, fraternity_name, university')
      .in('id', chapterIds);
    const chapterMap: Record<string, { fraternity_name: string; university: string }> = {};
    for (const ch of (chapters || [])) chapterMap[ch.id] = ch;

    // 5. Send via Linq — active lines only
    for (const [lineNum, contacts] of Object.entries(byLine)) {
      const fromPhone = ALL_LINE_PHONES[Number(lineNum)];

      for (const contact of contacts) {
        const chapter = chapterMap[contact.chapter_id] || { fraternity_name: 'your fraternity', university: 'your school' };
        const joinLink = CHAPTER_JOIN_LINKS[contact.chapter_id] || 'https://trailblaize.net';
        const isT1 = contact.outreach_status === 'not_contacted';
        const message = isT1
          ? buildT1Message(contact.first_name, chapter.fraternity_name, chapter.university, joinLink)
          : buildT2Message(contact.first_name, chapter.fraternity_name);

        try {
          const chat = await createChat(fromPhone, contact.phone_primary, message);
          const service = getRecipientService(chat);

          if (service === 'SMS') {
            await supabase.from('alumni_contacts').update({ is_imessage: false }).eq('id', contact.id);
            results.skipped_sms++;
            continue;
          }

          const now = new Date().toISOString();
          const update = isT1
            ? { outreach_status: 'touch1_sent', touch1_sent_at: now, linq_chat_id: chat.id }
            : { outreach_status: 'touch2_sent', touch2_sent_at: now };
          await supabase.from('alumni_contacts').update(update).eq('id', contact.id);
          results.sent++;

          await sleep(300); // rate limit
        } catch (e) {
          results.errors.push(`${contact.first_name} (${contact.phone_primary}): ${String(e)}`);
          results.failed++;
        }
      }
    }

    // 6. Mark complete
    await supabase
      .from('outreach_batches')
      .update({ status: 'completed', sent_at: new Date().toISOString() })
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
    // Roll back so it can be retried
    await supabase.from('outreach_batches').update({ status: 'approved' }).eq('id', id);
    console.error('[execute batch] hard error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
