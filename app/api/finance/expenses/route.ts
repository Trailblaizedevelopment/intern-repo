import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// GET all expenses with optional filters
export async function GET(request: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const importBatchId = searchParams.get('import_batch_id');

    let query = supabaseAdmin!
      .from('expenses')
      .select('*')
      .order('date', { ascending: false });

    if (importBatchId) {
      query = query.eq('import_batch_id', importBatchId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching expenses:', error);
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

// POST new expense or bulk insert array of expenses
export async function POST(request: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

    const body = await request.json();

    // Bulk insert: body is an array
    if (Array.isArray(body)) {
      if (body.length === 0) {
        return NextResponse.json({ data: [], error: null });
      }
      const { data, error } = await supabaseAdmin!
        .from('expenses')
        .insert(body)
        .select('*');

      if (error) {
        console.error('Error bulk inserting expenses:', error);
        return NextResponse.json(
          { data: null, error: { message: error.message, code: error.code } },
          { status: 400 }
        );
      }
      return NextResponse.json({ data, error: null });
    }

    // Single insert
    const {
      date,
      amount,
      category,
      vendor,
      description,
      payment_method,
      receipt_url,
      type,
      import_batch_id,
    } = body;

    if (!date || !amount || !category || !payment_method) {
      return NextResponse.json(
        { data: null, error: { message: 'date, amount, category, and payment_method are required', code: 'MISSING_FIELDS' } },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin!
      .from('expenses')
      .insert([{
        date,
        amount,
        category,
        vendor,
        description,
        payment_method,
        receipt_url,
        type,
        import_batch_id,
      }])
      .select('*')
      .single();

    if (error) {
      console.error('Error creating expense:', error);
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
