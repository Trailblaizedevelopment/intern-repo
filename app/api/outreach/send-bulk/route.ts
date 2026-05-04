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

// Per-line daily T1 cap — 45 new convos/line is the safe Linq limit
const DAILY_CAP_PER_LINE = 45;

// Max contacts per single API call — at 1s delay this = ~200s, safely inside 300s Vercel limit
const MAX_PER_CALL = 200;

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

/**
 * GET /api/outreach/send-bulk?chapter_id=xxx&touch=T1
 * Returns today's remaining send capacity without sending anything.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const chapter_id = searchParams.get('chapter_id');
    const touch = (searchParams.get('touch') || 'T1') as 'T1' | 'T2' | 'T3';

    if (!chapter_id) return NextResponse.json({ error: 'chapter_id is required' }, { status: 400 });

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

    // Daily capacity check (T1 only)
    let remainingCapacity = OUTREACH_LINES.length * DAILY_CAP_PER_LINE;
    if (touch === 'T1') {
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
      remainingCapacity = OUTREACH_LINES.reduce((sum, line) => {
        const used = sentTodayPerLine[line.number] || 0;
        return sum + Math.max(0, DAILY_CAP_PER_LINE - used);
      }, 0);
    }

    // Total eligible in chapter
    const statusFilter = touch === 'T1' ? 'not_contacted' : touch === 'T2' ? 'touch1_sent' : 'touch2_sent';
    const { count: totalEligible } = await supabase
      .from('alumni_contacts')
      .select('id', { count: 'exact', head: true })
      .eq('chapter_id', chapter_id)
      .not('phone_primary', 'is', null)
      .not('first_name', 'is', null)
      .eq('flagged', false)
      .eq('outreach_status', statusFilter);

    const eligible = totalEligible ?? 0;
    const sendableToday = Math.min(eligible, remainingCapacity);
    const notTouchedToday = Math.max(0, eligible - sendableToday);
    const thisRun = Math.min(sendableToday, MAX_PER_CALL);

    return NextResponse.json({
      eligible,
      sendable_today: sendableToday,
      not_touched_today: notTouchedToday,
      this_run: thisRun,
      daily_cap_total: OUTREACH_LINES.length * DAILY_CAP_PER_LINE,
      remaining_capacity: remainingCapacity,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { chapter_id, touch = 'T1', limit } = body as {
      chapter_id: string;
      touch: 'T1' | 'T2' | 'T3';
      limit?: number;
    };

    if (!chapter_id) return NextResponse.json({ error: 'chapter_id is required' }, { status: 400 });

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

    // ── Daily limit guard (T1 only) ───────────────────────────────────────────
    // Count how many T1s each line has already sent today across ALL chapters.
    // This prevents blowing the 45/line/day Linq cap, regardless of chapter.
    let totalDailyCapacity = OUTREACH_LINES.length * DAILY_CAP_PER_LINE; // max if no sends yet today
    if (touch === 'T1') {
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

      // Sum remaining capacity across all outreach lines
      totalDailyCapacity = OUTREACH_LINES.reduce((sum, line) => {
        const used = sentTodayPerLine[line.number] || 0;
        return sum + Math.max(0, DAILY_CAP_PER_LINE - used);
      }, 0);

      if (totalDailyCapacity === 0) {
        return NextResponse.json({
          success: false,
          error: 'Daily T1 limit reached across all lines (45/line). Resume tomorrow.',
          daily_cap_hit: true,
          sent: 0,
          failed: 0,
          total: 0,
          remaining: 0,
        });
      }
    }

    // ── Effective limit: respect caller's limit, daily capacity, and per-call cap ─
    // MAX_PER_CALL ensures we never exceed the Vercel 300s timeout.
    // At 1s delay per send: 200 contacts = ~200s — safely inside the limit.
    const requestedLimit = limit ?? totalDailyCapacity;
    const effectiveLimit = Math.min(requestedLimit, totalDailyCapacity, MAX_PER_CALL);

    // Get chapter info
    const { data: chapter } = await supabase
      .from('chapters')
      .select('fraternity, school, alumni_join_link')
      .eq('id', chapter_id)
      .single();
    if (!chapter) return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });

    // Fetch eligible contacts up to effectiveLimit
    let query = supabase
      .from('alumni_contacts')
      .select('id, first_name, last_name, phone_primary, outreach_status, touch1_sent_at')
      .eq('chapter_id', chapter_id)
      .not('phone_primary', 'is', null)
      .not('first_name', 'is', null)
      .eq('flagged', false)
      .limit(effectiveLimit);

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
      return NextResponse.json({
        success: true,
        sent: 0,
        failed: 0,
        total: 0,
        remaining: 0,
        message: 'No eligible contacts found',
      });
    }

    // Count total eligible in chapter so UI can show how many remain after this batch
    const { count: totalEligible } = await supabase
      .from('alumni_contacts')
      .select('id', { count: 'exact', head: true })
      .eq('chapter_id', chapter_id)
      .not('phone_primary', 'is', null)
      .not('first_name', 'is', null)
      .eq('flagged', false)
      .eq('outreach_status', touch === 'T1' ? 'not_contacted' : touch === 'T2' ? 'touch1_sent' : 'touch2_sent');

    const results = {
      sent: 0,
      failed: 0,
      total: contacts.length,
      total_eligible: totalEligible ?? contacts.length,
      remaining: 0,
      errors: [] as string[],
    };

    for (const contact of contacts) {
      const line = nextLine();
      try {
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

      // 1s delay between sends — keeps us well inside the 300s Vercel limit
      // (200 contacts × 1s = ~200s) while still spacing messages naturally
      if (results.sent + results.failed < contacts.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    results.remaining = Math.max(0, (totalEligible ?? 0) - results.sent);

    return NextResponse.json({ success: true, ...results });
  } catch (err) {
    console.error('[send-bulk] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
