import { NextRequest, NextResponse } from 'next/server';
import { messaging, renderTemplate } from '@/lib/messaging';
import { SENDING_LINES } from '@/lib/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const TEMPLATES = {
  touch1: `Hey is this {first_name} {last_name}? My name is {sender_name}, and I am checking to verify your phone number for the {school} {fraternity} alumni list.`,
  touch2_confirmed: `Great, I'm reaching out because we partnered with {school} {fraternity} to launch Trailblaize, a free LinkedIn-style platform that connects actives and alumni. Here's the signup link: {signup_link}`,
  touch2_no_response: `Hey {first_name}, following up — we partnered with {school} {fraternity} to launch Trailblaize, a free platform that connects actives and alumni. Here's the signup link if you're interested: {signup_link}`,
  touch3: `Hey {first_name}, just checking back in — did you get a chance to sign up? Happy to answer any questions.`,
};

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { data: null, error: { message: 'Server configuration error', code: 'CONFIG_ERROR' } },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const {
      chapter_id,
      touch,
      sender_name = 'Owen',
      school,
      fraternity,
      signup_link,
      batch_size = 50,
      template_override,
    } = body;

    if (!chapter_id || !touch || ![1, 2, 3].includes(touch)) {
      return NextResponse.json(
        { data: null, error: { message: 'chapter_id and touch (1, 2, or 3) are required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    if ((touch === 1 || touch === 2) && (!school || !fraternity)) {
      return NextResponse.json(
        { data: null, error: { message: 'school and fraternity are required for touch 1 and 2', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    if (touch === 2 && !signup_link) {
      return NextResponse.json(
        { data: null, error: { message: 'signup_link is required for touch 2', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    // Build eligibility query
    let query = supabase
      .from('alumni_contacts')
      .select('id, first_name, last_name, phone_primary, provider_conversation_id, assigned_line, response_classification, outreach_status, touch1_sent_at, touch2_sent_at')
      .eq('chapter_id', chapter_id)
      .eq('is_imessage', true);

    if (touch === 1) {
      query = query.eq('outreach_status', 'not_contacted').is('touch1_sent_at', null);
    } else if (touch === 2) {
      query = query.not('touch1_sent_at', 'is', null).is('touch2_sent_at', null);
    } else if (touch === 3) {
      query = query
        .not('touch2_sent_at', 'is', null)
        .is('touch3_sent_at', null)
        .not('outreach_status', 'in', '("signed_up","wrong_number","opted_out")');
    }

    const { data: candidates, error: fetchErr } = await query
      .order('created_at', { ascending: true })
      .limit(batch_size * 2);

    if (fetchErr) {
      return NextResponse.json(
        { data: null, error: { message: fetchErr.message, code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ data: { sent: 0, per_line: [], errors: [] }, error: null });
    }

    // Date-based filtering for touch 2 & 3
    let eligible = candidates;
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    if (touch === 2) {
      eligible = candidates.filter(c =>
        c.response_classification === 'confirmed' || (c.touch1_sent_at && c.touch1_sent_at < twoDaysAgo)
      );
    } else if (touch === 3) {
      eligible = candidates.filter(c =>
        c.touch2_sent_at && c.touch2_sent_at < twoDaysAgo
      );
    }

    eligible = eligible.slice(0, batch_size);
    if (eligible.length === 0) {
      return NextResponse.json({ data: { sent: 0, per_line: [], errors: [] }, error: null });
    }

    // Check today's line capacity
    const touchCol = `touch${touch}_sent_at`;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const lineCounts: Record<number, number> = {};
    for (const line of SENDING_LINES) {
      const { count } = await supabase
        .from('alumni_contacts')
        .select('*', { count: 'exact', head: true })
        .eq('chapter_id', chapter_id)
        .eq('assigned_line', line.number)
        .gte(touchCol, todayStart.toISOString());
      lineCounts[line.number] = count ?? 0;
    }

    const availableLines = SENDING_LINES
      .filter(l => lineCounts[l.number] < l.daily_limit)
      .map(l => ({ ...l, remaining: l.daily_limit - lineCounts[l.number], sent_now: 0 }));

    if (availableLines.length === 0) {
      return NextResponse.json({
        data: { sent: 0, per_line: [], errors: [], message: 'All lines at daily capacity' },
        error: null,
      });
    }

    const errors: { contact_id: string; message: string }[] = [];
    let sentCount = 0;

    // Send in batches of 5
    for (let i = 0; i < eligible.length; i += 5) {
      if (i > 0) await new Promise(r => setTimeout(r, 1000));
      const batch = eligible.slice(i, i + 5);

      await Promise.all(batch.map(async (contact) => {
        const line = availableLines
          .filter(l => l.remaining > 0)
          .sort((a, b) => b.remaining - a.remaining)[0];
        if (!line) return;

        const variables: Record<string, string> = {
          first_name: contact.first_name || '',
          last_name: contact.last_name || '',
          sender_name: line.label || sender_name,
          school: school || '',
          fraternity: fraternity || '',
          signup_link: signup_link || '',
        };

        let template: string;
        if (template_override) {
          template = template_override;
        } else if (touch === 1) {
          template = TEMPLATES.touch1;
        } else if (touch === 2) {
          template = contact.response_classification === 'confirmed'
            ? TEMPLATES.touch2_confirmed
            : TEMPLATES.touch2_no_response;
        } else {
          template = TEMPLATES.touch3;
        }

        const result = await messaging.sendOutreach({
          contact_id: contact.id,
          template,
          variables,
          line_phone: line.phone,
          to_phone: contact.phone_primary!,
          touch_number: touch as 1 | 2 | 3,
          existing_conversation_id: contact.provider_conversation_id || undefined,
        });

        if (result.success) {
          // Also update assigned_line and outreach_queue
          await supabase
            .from('alumni_contacts')
            .update({ assigned_line: line.number })
            .eq('id', contact.id);

          await supabase
            .from('outreach_queue')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('contact_id', contact.id)
            .eq('status', 'pending');

          line.remaining--;
          line.sent_now++;
          sentCount++;
        } else {
          errors.push({ contact_id: contact.id, message: result.error || 'Unknown error' });
        }
      }));
    }

    return NextResponse.json({
      data: {
        sent: sentCount,
        per_line: availableLines.map(l => ({
          line: l.number,
          label: l.label,
          sent: l.sent_now,
          remaining: l.remaining,
        })),
        errors,
      },
      error: null,
    });
  } catch (err) {
    console.error('Error sending batch:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Failed to send batch', code: 'SERVER_ERROR' } },
      { status: 500 }
    );
  }
}
