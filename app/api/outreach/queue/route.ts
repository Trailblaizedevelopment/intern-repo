import { NextRequest, NextResponse } from 'next/server';
import { SENDING_LINES } from '@/lib/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/outreach/queue?chapter_id=xxx&line_number=1
 * Returns the next daily_limit pending contacts for that line.
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ data: null, error: { message: 'Database not connected', code: 'DB_ERROR' } }, { status: 500 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const chapterId = searchParams.get('chapter_id');
    const lineNumber = parseInt(searchParams.get('line_number') || '0');

    if (!chapterId || !lineNumber) {
      return NextResponse.json({ data: null, error: { message: 'chapter_id and line_number are required', code: 'VALIDATION_ERROR' } }, { status: 400 });
    }

    const line = SENDING_LINES.find(l => l.number === lineNumber);
    if (!line) {
      return NextResponse.json({ data: null, error: { message: 'Invalid line_number', code: 'VALIDATION_ERROR' } }, { status: 400 });
    }

    const { data: queue, error } = await supabase
      .from('outreach_queue')
      .select('*, contact:alumni_contacts(id, first_name, last_name, phone_primary, phone_secondary, email, year, outreach_status)')
      .eq('chapter_id', chapterId)
      .eq('line_number', lineNumber)
      .eq('status', 'pending')
      .order('queue_position', { ascending: true })
      .limit(line.daily_limit);

    if (error) {
      return NextResponse.json({ data: null, error: { message: error.message, code: 'DB_ERROR' } }, { status: 500 });
    }

    return NextResponse.json({
      data: {
        line_number: lineNumber,
        line_label: line.label,
        daily_limit: line.daily_limit,
        queue: queue || [],
      },
      error: null,
    });
  } catch (err) {
    console.error('Error fetching queue:', err);
    return NextResponse.json({ data: null, error: { message: 'Failed to fetch queue', code: 'SERVER_ERROR' } }, { status: 500 });
  }
}
