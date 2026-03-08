import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/outreach/batches
 * Returns outreach batches. Supports ?status=pending_approval&limit=20
 *
 * POST /api/outreach/batches
 * Creates a new outreach batch with optional contacts array.
 * Body: { scheduled_date, notes?, created_by?, contacts?: [...] }
 */

export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_ERROR' } }, { status: 500 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending_approval';
    const limit  = Math.min(parseInt(searchParams.get('limit') || '20'), 100);

    let query = supabase
      .from('outreach_batches')
      .select('*')
      .order('scheduled_date', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    }

    return NextResponse.json({ data: data || [], error: null });
  } catch (err) {
    console.error('[GET /api/outreach/batches]', err);
    return NextResponse.json({ data: null, error: { message: 'Server error', code: 'SERVER_ERROR' } }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_ERROR' } }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { scheduled_date, notes, created_by, contacts } = body;

    if (!scheduled_date) {
      return NextResponse.json({ data: null, error: { message: 'scheduled_date is required', code: 'VALIDATION_ERROR' } }, { status: 400 });
    }

    // Create the batch
    const { data: batch, error: batchErr } = await supabase
      .from('outreach_batches')
      .insert([{
        scheduled_date,
        notes:      notes      || null,
        created_by: created_by || null,
        status: 'pending_approval',
      }])
      .select()
      .single();

    if (batchErr || !batch) {
      return NextResponse.json({ data: null, error: { message: batchErr?.message || 'Failed to create batch', code: 'DB_ERROR' } }, { status: 500 });
    }

    // Insert contacts if provided
    if (Array.isArray(contacts) && contacts.length > 0) {
      const rows = contacts.map((c: {
        contact_id?: string; name?: string; phone?: string; chapter?: string;
        touch_number?: number; linq_line?: number; message_preview?: string;
      }) => ({
        batch_id:        batch.id,
        contact_id:      c.contact_id      || null,
        name:            c.name            || null,
        phone:           c.phone           || null,
        chapter:         c.chapter         || null,
        touch_number:    c.touch_number    || null,
        linq_line:       c.linq_line       || null,
        message_preview: c.message_preview || null,
        status: 'pending',
      }));

      const { error: contactsErr } = await supabase
        .from('outreach_batch_contacts')
        .insert(rows);

      if (contactsErr) {
        console.error('[POST /api/outreach/batches] contacts insert error:', contactsErr);
      }
    }

    return NextResponse.json({ data: batch, error: null }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/outreach/batches]', err);
    return NextResponse.json({ data: null, error: { message: 'Server error', code: 'SERVER_ERROR' } }, { status: 500 });
  }
}
