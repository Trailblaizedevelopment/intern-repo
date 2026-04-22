import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { createChat } from '@/lib/linq';

export const maxDuration = 300;

// Outreach lines — EXCLUDE lines 1 (Owen) and 3 (Ford) which are reserved for Connects Center
const OUTREACH_LINES = [
  { number: 2,  phone: '+16462178274' }, // Adam
  { number: 4,  phone: '+14044239427' },
  { number: 5,  phone: '+14045428435' },
  { number: 6,  phone: '+19725590427' },
  { number: 7,  phone: '+19725590438' },
  { number: 8,  phone: '+15042234218' },
  { number: 9,  phone: '+15042236050' },
  { number: 10, phone: '+12817773280' },
  { number: 11, phone: '+12817452268' },
];
let lineIdx = 0;
function nextLine() {
  const line = OUTREACH_LINES[lineIdx % OUTREACH_LINES.length];
  lineIdx++;
  return line;
}

function buildT1Message(firstName: string, fraternityName: string, school: string): string {
  return `Hey ${firstName}, this is Ford from Trailblaize. I'm reaching out to verify your phone number on the ${school} ${fraternityName} alumni list. Do I have the right number?`;
}
function buildT2Message(firstName: string, fraternityName: string, school: string, joinLink: string): string {
  return `Hey ${firstName}, great! Here's the link to join the ${fraternityName} alumni network at ${school} - free, takes 2 min: ${joinLink}`;
}
function buildT3Message(firstName: string): string {
  return `Hey ${firstName}, just checking - did you get a chance to join? Happy to answer any questions.`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { chapter_id, touch = 'T1', limit = 100 } = body as {
      chapter_id: string;
      touch: 'T1' | 'T2' | 'T3';
      limit?: number;
    };

    if (!chapter_id) return NextResponse.json({ error: 'chapter_id is required' }, { status: 400 });

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

    // Get chapter info
    const { data: chapter } = await supabase.from('chapters').select('fraternity, school, alumni_join_link').eq('id', chapter_id).single();
    if (!chapter) return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });

    // Fetch eligible contacts
    let query = supabase
      .from('alumni_contacts')
      .select('id, first_name, last_name, phone_primary, outreach_status, touch1_sent_at')
      .eq('chapter_id', chapter_id)
      .not('phone_primary', 'is', null)
      .not('first_name', 'is', null)
      .eq('flagged', false)
      .limit(Math.min(limit, 500));

    if (touch === 'T1') {
      query = query.eq('outreach_status', 'not_contacted');
    } else if (touch === 'T2') {
      query = query.in('outreach_status', ['touch1_sent', 'touch1_confirmed']);
    } else {
      query = query.eq('outreach_status', 'touch2_sent');
    }

    const { data: contacts, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ success: true, sent: 0, failed: 0, total: 0, message: 'No eligible contacts found' });
    }

    const results = { sent: 0, failed: 0, total: contacts.length, errors: [] as string[] };

    for (const contact of contacts) {
      const line = nextLine();
      try {
        // Build message
        let message = '';
        if (touch === 'T1') {
          message = buildT1Message(contact.first_name, chapter.fraternity || '', chapter.school || '');
        } else if (touch === 'T2') {
          message = buildT2Message(contact.first_name, chapter.fraternity || '', chapter.school || '', chapter.alumni_join_link || 'https://trailblaize.net');
        } else {
          message = buildT3Message(contact.first_name);
        }

        // Create chat and send via Linq
        const chat = await createChat(line.phone, contact.phone_primary!, message);

        // Update contact status
        const now = new Date().toISOString();
        const updates: Record<string, unknown> = {
          linq_chat_id: chat.id,
          assigned_line: line.number,
        };
        if (touch === 'T1') {
          updates.outreach_status = 'touch1_sent';
          updates.touch1_sent_at = now;
        } else if (touch === 'T2') {
          updates.outreach_status = 'touch2_sent';
          updates.touch2_sent_at = now;
        } else {
          updates.outreach_status = 'touch3_sent';
          updates.touch3_sent_at = now;
        }

        await supabase.from('alumni_contacts').update(updates).eq('id', contact.id);
        results.sent++;
      } catch (e) {
        results.failed++;
        results.errors.push(`${contact.first_name} ${contact.last_name || ''} (${contact.id}): ${String(e)}`);
      }

      // 2s delay between sends
      if (results.sent + results.failed < contacts.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    return NextResponse.json({ success: true, ...results });
  } catch (err) {
    console.error('[send-bulk] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
