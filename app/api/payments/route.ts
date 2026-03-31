import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// GET all payments with optional filters
export async function GET(request: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    const { searchParams } = new URL(request.url);
    const chapterId = searchParams.get('chapter_id');
    const status = searchParams.get('status');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    let query = supabaseAdmin
      .from('payments')
      .select(`
        *,
        chapter:chapters(id, chapter_name, school, fraternity, contact_name, contact_email)
      `)
      .order('payment_date', { ascending: false });

    if (chapterId) {
      query = query.eq('chapter_id', chapterId);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (startDate) {
      query = query.gte('payment_date', startDate);
    }
    if (endDate) {
      query = query.lte('payment_date', endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching payments:', error);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code } },
        { status: 400 }
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

// POST new payment
export async function POST(request: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    const body = await request.json();
    const { chapter_id, amount, payment_date, payment_method, status, reference_number, notes, period_start, period_end } = body;

    if (!chapter_id || !amount) {
      return NextResponse.json(
        { data: null, error: { message: 'Chapter and amount are required', code: 'MISSING_FIELDS' } },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('payments')
      .insert([{
        chapter_id,
        amount,
        payment_date: payment_date || new Date().toISOString().split('T')[0],
        payment_method: payment_method || 'card',
        status: status || 'completed',
        reference_number,
        notes,
        period_start,
        period_end,
      }])
      .select(`
        *,
        chapter:chapters(id, chapter_name, school, fraternity)
      `)
      .single();

    if (error) {
      console.error('Error creating payment:', error);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code } },
        { status: 400 }
      );
    }

    // Update the chapter's last_payment_date
    await supabaseAdmin
      .from('chapters')
      .update({ 
        last_payment_date: payment_date || new Date().toISOString().split('T')[0],
      })
      .eq('id', chapter_id);

    return NextResponse.json({ data, error: null });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
