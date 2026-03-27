import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/outreach/batches
 * Returns outreach batches. Supports ?status=pending_approval&limit=20
 *
 * POST /api/outreach/batches
 * Creates a new outreach batch.
 * Body: { scheduled_date, total_contacts, chapters, lines, touch_breakdown, sample_messages, notes? }
 */

export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_ERROR' } }, { status: 500 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const chapterId = searchParams.get('chapter_id');
    const date = searchParams.get('date');
    const limit  = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    let query = supabase
      .from('outreach_batches')
      .select('*')
      .order('scheduled_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    if (chapterId) {
      query = query.eq('chapter_id', chapterId);
    }
    if (date) {
      query = query.eq('scheduled_date', date);
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
    const {
      scheduled_date,
      total_contacts,
      chapters,
      lines,
      touch_breakdown,
      sample_messages,
      notes,
    } = body;

    if (!scheduled_date) {
      return NextResponse.json({ data: null, error: { message: 'scheduled_date is required', code: 'VALIDATION_ERROR' } }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('outreach_batches')
      .insert({
        scheduled_date,
        status: 'pending_approval',
        total_contacts: total_contacts ?? null,
        chapters: chapters ?? null,
        lines: lines ?? null,
        touch_breakdown: touch_breakdown ?? null,
        sample_messages: sample_messages ?? null,
        notes: notes ?? null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ data: null, error: { message: error.message, code: 'DB_ERROR' } }, { status: 500 });
    }

    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/outreach/batches]', err);
    return NextResponse.json({ data: null, error: { message: 'Server error', code: 'SERVER_ERROR' } }, { status: 500 });
  }
}
