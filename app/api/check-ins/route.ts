import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Get check-ins for a chapter
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { data: null, error: { message: 'Database not connected', code: 'DB_ERROR' } },
      { status: 500 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const chapterId = searchParams.get('chapter_id');
    const limit = parseInt(searchParams.get('limit') || '10');

    if (!chapterId) {
      return NextResponse.json(
        { data: null, error: { message: 'Chapter ID is required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    // Get check-ins with action items
    const { data: checkIns, error } = await supabase
      .from('chapter_check_ins')
      .select(`
        *,
        action_items:check_in_action_items(*)
      `)
      .eq('chapter_id', chapterId)
      .order('check_in_date', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message, code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: checkIns, error: null });
  } catch (err) {
    console.error('Error getting check-ins:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Failed to get check-ins', code: 'SERVER_ERROR' } },
      { status: 500 }
    );
  }
}

// Create a new check-in
export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { data: null, error: { message: 'Database not connected', code: 'DB_ERROR' } },
      { status: 500 }
    );
  }

  try {
    const { chapter_id, check_in_date, notes, health_score, action_items, created_by } = await request.json();

    if (!chapter_id) {
      return NextResponse.json(
        { data: null, error: { message: 'Chapter ID is required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    // Create the check-in
    const { data: checkIn, error: checkInError } = await supabase
      .from('chapter_check_ins')
      .insert({
        chapter_id,
        check_in_date: check_in_date || new Date().toISOString().split('T')[0],
        notes,
        health_score,
        created_by,
      })
      .select()
      .single();

    if (checkInError) {
      return NextResponse.json(
        { data: null, error: { message: checkInError.message, code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    // Insert action items if provided
    if (action_items && action_items.length > 0) {
      const actionItemRecords = action_items.map((item: string) => ({
        check_in_id: checkIn.id,
        action_item: item,
      }));

      const { error: actionError } = await supabase
        .from('check_in_action_items')
        .insert(actionItemRecords);

      if (actionError) {
        console.error('Action items error:', actionError);
      }
    }

    // Update chapter's last and next check-in dates
    const { data: chapter } = await supabase
      .from('chapters')
      .select('check_in_frequency')
      .eq('id', chapter_id)
      .single();

    const frequency = chapter?.check_in_frequency || 'biweekly';
    const nextDate = calculateNextCheckInDate(check_in_date || new Date().toISOString().split('T')[0], frequency);

    await supabase
      .from('chapters')
      .update({
        last_check_in_date: check_in_date || new Date().toISOString().split('T')[0],
        next_check_in_date: nextDate,
        health: health_score === 'excellent' || health_score === 'good' ? 'good' 
              : health_score === 'needs_attention' ? 'warning' 
              : health_score === 'at_risk' ? 'critical' : undefined,
        last_activity: new Date().toISOString().split('T')[0],
      })
      .eq('id', chapter_id);

    return NextResponse.json({ data: checkIn, error: null });
  } catch (err) {
    console.error('Error creating check-in:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Failed to create check-in', code: 'SERVER_ERROR' } },
      { status: 500 }
    );
  }
}

// Update check-in frequency for a chapter
export async function PATCH(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { data: null, error: { message: 'Database not connected', code: 'DB_ERROR' } },
      { status: 500 }
    );
  }

  try {
    const { chapter_id, frequency } = await request.json();

    if (!chapter_id || !frequency) {
      return NextResponse.json(
        { data: null, error: { message: 'Chapter ID and frequency are required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    // Get current last check-in date
    const { data: chapter } = await supabase
      .from('chapters')
      .select('last_check_in_date')
      .eq('id', chapter_id)
      .single();

    // Calculate new next check-in date if there's a last check-in
    const nextDate = chapter?.last_check_in_date 
      ? calculateNextCheckInDate(chapter.last_check_in_date, frequency)
      : null;

    const { data, error } = await supabase
      .from('chapters')
      .update({
        check_in_frequency: frequency,
        next_check_in_date: nextDate,
      })
      .eq('id', chapter_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message, code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('Error updating frequency:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Failed to update frequency', code: 'SERVER_ERROR' } },
      { status: 500 }
    );
  }
}

function calculateNextCheckInDate(lastDate: string, frequency: string): string {
  const date = new Date(lastDate);
  switch (frequency) {
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'biweekly':
      date.setDate(date.getDate() + 14);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    default:
      date.setDate(date.getDate() + 14);
  }
  return date.toISOString().split('T')[0];
}
