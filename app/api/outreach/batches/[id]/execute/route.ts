import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getPlatformAdmin } from '@/lib/supabase-platform';
import { createChat, getRecipientService } from '@/lib/linq';

const LINQ_LINES: Record<number, string> = {
  1: '+16462408056', // Owen (flagged — do not use)
  2: '+16462668785', // Adam
  3: '+16462442696', // Ford
};

const CHAPTER_JOIN_LINKS: Record<string, string> = {
  'c15ddcc2-341b-459a-b508-16aa65d56d8f': 'https://www.trailblaize.net/alumni-join/dFxw7fYkiK8dUCl8xwC7UFbuMwIC3Fpt', // Alabama KA
  '57dde7fc-e048-430b-b872-b1baedda0263': 'https://www.trailblaize.net/join/9LiZS3SVKrvBCM8N6QLvgsoMW3undNn5',       // Ole Miss ATO
  'a2cc8a73-ec38-489c-b6f0-640871293fda': 'https://www.trailblaize.net/alumni-join/DGY5vgkFAve9DKC0Azcg6hu4XFCJtdJC', // Boulder Theta Xi
};

function buildT1Message(firstName: string, fraternityName: string, school: string, joinLink: string): string {
  return `Hey ${firstName}! Reaching out on behalf of ${fraternityName} at ${school}. We're rebuilding our alumni network and would love to have you involved. Join here: ${joinLink} - takes 2 min!`;
}

function buildT2Message(firstName: string, fraternityName: string): string {
  return `Hey ${firstName}, just following up! Wanted to make sure you saw our message about the ${fraternityName} alumni network. Would love to get you connected - interested?`;
}

function buildT3Message(firstName: string): string {
  return `Hey ${firstName}, last follow-up! If you ever want to join the alumni network just use the link from our previous message. Hope all is well!`;
}

/**
 * POST /api/outreach/batches/[id]/execute
 * Executes the actual Linq sends for an approved batch.
 * SAFE: Checks status=approved before executing. Updates to 'sending' first to prevent double-runs.
 * Do NOT call this more than once — the status check prevents duplicates.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const platform = getPlatformAdmin();

  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });
  if (!platform) return NextResponse.json({ error: 'Platform DB not configured' }, { status: 500 });

  // 1. Fetch batch — must be 'approved' to proceed
  const { data: batch, error: bErr } = await supabase
    .from('outreach_batches')
    .select('*')
    .eq('id', id)
    .single();

  if (bErr || !batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  if (batch.status !== 'approved') {
    return NextResponse.json({ error: `Batch status is '${batch.status}' — only 'approved' batches can be executed` }, { status: 409 });
  }

  // 2. Lock the batch immediately to prevent double-runs
  await supabase.from('outreach_batches').update({ status: 'sending' }).eq('id', id);

  const results = { sent: 0, failed: 0, skipped: 0, errors: [] as string[] };

  try {
    // 3. Build contact list per line from batch notes (pre-compiled at batch creation)
    const notes = typeof batch.notes === 'string' ? JSON.parse(batch.notes) : batch.notes;
    const contactIds: string[] = notes?.contact_ids || [];

    if (!contactIds.length) {
      // Fall back to re-querying: load verified + touch1_sent 2+ days on lines 2+3
      const cutoffT2 = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const cutoffT3 = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();

      const [t1res, t2res] = await Promise.all([
        supabase.from('alumni_contacts')
          .select('id, first_name, last_name, phone_primary, chapter_id, assigned_line, outreach_status')
          .eq('outreach_status', 'verified')
          .is('touch1_sent_at', null)
          .in('assigned_line', [2, 3])
          .limit(100),
        supabase.from('alumni_contacts')
          .select('id, first_name, last_name, phone_primary, chapter_id, assigned_line, outreach_status, touch1_sent_at')
          .eq('outreach_status', 'touch1_sent')
          .lte('touch1_sent_at', cutoffT2)
          .in('assigned_line', [2, 3])
          .limit(100),
      ]);

      const contacts = [...(t1res.data || []), ...(t2res.data || [])];

      // Group by line, cap at 45
      const byLine: Record<number, typeof contacts> = { 2: [], 3: [] };
      for (const c of contacts) {
        const line = c.assigned_line;
        if ((line === 2 || line === 3) && byLine[line].length < 45) byLine[line].push(c);
      }

      // Load chapter info from platform DB
      const chapterIds = [...new Set(contacts.map(c => c.chapter_id).filter(Boolean))];
      const { data: chapters } = await platform.from('chapters').select('id, chapter_name, fraternity_name, university').in('id', chapterIds);
      const chapterMap: Record<string, { chapter_name: string; fraternity_name: string; university: string }> = {};
      for (const ch of (chapters || [])) chapterMap[ch.id] = ch;

      for (const lineContacts of Object.values(byLine)) {
        for (const contact of lineContacts) {
          const fromPhone = LINQ_LINES[contact.assigned_line];
          if (!fromPhone) continue;

          const chapter = chapterMap[contact.chapter_id] || { chapter_name: 'your chapter', fraternity_name: 'your fraternity', university: 'your school' };
          const joinLink = CHAPTER_JOIN_LINKS[contact.chapter_id] || 'https://trailblaize.net';
          const touch = contact.outreach_status === 'verified' ? 1 : 2;
          const message = touch === 1
            ? buildT1Message(contact.first_name, chapter.fraternity_name, chapter.university, joinLink)
            : buildT2Message(contact.first_name, chapter.fraternity_name);

          try {
            const chat = await createChat(fromPhone, contact.phone_primary, message);
            const service = getRecipientService(chat);
            if (service === 'SMS') {
              // Skip SMS — iMessage only policy
              results.skipped++;
              await supabase.from('alumni_contacts').update({ is_imessage: false }).eq('id', contact.id);
              continue;
            }
            const updateField = touch === 1
              ? { outreach_status: 'touch1_sent', touch1_sent_at: new Date().toISOString(), linq_chat_id: chat.id }
              : { outreach_status: 'touch2_sent', touch2_sent_at: new Date().toISOString() };
            await supabase.from('alumni_contacts').update(updateField).eq('id', contact.id);
            results.sent++;
          } catch (e) {
            results.errors.push(`${contact.first_name} ${contact.last_name}: ${String(e)}`);
            results.failed++;
          }
        }
      }
    }

    // 4. Mark batch as completed
    await supabase.from('outreach_batches').update({
      status: 'completed',
      results: results as Record<string, unknown>,
    }).eq('id', id);

    return NextResponse.json({ data: results, error: null });

  } catch (err) {
    // Roll back to approved if something catastrophic fails
    await supabase.from('outreach_batches').update({ status: 'approved' }).eq('id', id);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
