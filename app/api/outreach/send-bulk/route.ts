import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// POST /api/outreach/send-bulk
// Body: { chapter_id: string, touch: 'T1', limit?: number }
//
// Finds all eligible contacts and dispatches them to /api/outreach/send-single
// with a 2-second delay between each to avoid overwhelming Linq.

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { chapter_id, touch = 'T1', limit = 100 } = body as {
      chapter_id: string;
      touch: 'T1' | 'T2' | 'T3';
      limit?: number;
    };

    if (!chapter_id) {
      return NextResponse.json({ error: 'chapter_id is required' }, { status: 400 });
    }
    if (!['T1', 'T2', 'T3'].includes(touch)) {
      return NextResponse.json({ error: 'touch must be T1, T2, or T3' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

    // Fetch eligible contacts based on touch type
    let query = supabase
      .from('alumni_contacts')
      .select('id, first_name, phone_primary')
      .eq('chapter_id', chapter_id)
      .not('phone_primary', 'is', null)
      .not('first_name', 'is', null)
      .limit(Math.min(limit, 150));

    if (touch === 'T1') {
      query = query.eq('outreach_status', 'not_contacted').is('touch1_sent_at', null);
    } else if (touch === 'T2') {
      query = query.in('outreach_status', ['touch1_sent', 'touch1_confirmed']).is('touch2_sent_at', null);
    } else {
      query = query.eq('outreach_status', 'touch2_sent').is('touch3_sent_at', null);
    }

    const { data: contacts, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ success: true, sent: 0, failed: 0, total: 0, message: 'No eligible contacts found' });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
    const results = { sent: 0, failed: 0, total: contacts.length, errors: [] as string[] };

    for (const contact of contacts) {
      try {
        const res = await fetch(`${baseUrl}/api/outreach/send-single`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contact_id: contact.id, touch }),
        });
        const json = await res.json();
        if (json.success) {
          results.sent++;
        } else {
          results.failed++;
          results.errors.push(`${contact.first_name} (${contact.id}): ${json.error || 'unknown error'}`);
        }
      } catch (e) {
        results.failed++;
        results.errors.push(`${contact.first_name} (${contact.id}): ${String(e)}`);
      }

      // 2s delay between sends
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return NextResponse.json({ success: true, ...results });
  } catch (err) {
    console.error('[send-bulk] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
