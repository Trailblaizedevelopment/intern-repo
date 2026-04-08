import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// GET all import batches
export async function GET(request: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

    const { data, error } = await supabaseAdmin!
      .from('import_batches')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching import batches:', error);
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

// POST new import batch
export async function POST(request: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

    const body = await request.json();
    const { year, month, filename, total_revenue, total_expenses, line_count } = body;

    if (!year || !month || !filename) {
      return NextResponse.json(
        { data: null, error: { message: 'year, month, and filename are required', code: 'MISSING_FIELDS' } },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin!
      .from('import_batches')
      .insert([{
        year,
        month,
        filename,
        total_revenue,
        total_expenses,
        line_count,
      }])
      .select('*')
      .single();

    if (error) {
      console.error('Error creating import batch:', error);
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
