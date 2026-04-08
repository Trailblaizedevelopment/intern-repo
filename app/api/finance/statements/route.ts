import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// GET all monthly statements
export async function GET(request: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

    const { data, error } = await supabaseAdmin!
      .from('monthly_statements')
      .select('*')
      .order('year', { ascending: false })
      .order('month', { ascending: false });

    if (error) {
      console.error('Error fetching monthly statements:', error);
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

// POST upsert monthly statement (insert or update by year+month)
export async function POST(request: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

    const body = await request.json();
    const { year, month, attachment_url, attachment_name } = body;

    if (!year || !month) {
      return NextResponse.json(
        { data: null, error: { message: 'year and month are required', code: 'MISSING_FIELDS' } },
        { status: 400 }
      );
    }

    // Check if a statement for year+month already exists
    const { data: existing, error: fetchError } = await supabaseAdmin!
      .from('monthly_statements')
      .select('id')
      .eq('year', year)
      .eq('month', month)
      .maybeSingle();

    if (fetchError) {
      console.error('Error checking existing statement:', fetchError);
      return NextResponse.json(
        { data: null, error: { message: fetchError.message, code: fetchError.code } },
        { status: 400 }
      );
    }

    let data, error;

    if (existing) {
      // Update existing
      ({ data, error } = await supabaseAdmin!
        .from('monthly_statements')
        .update({ attachment_url, attachment_name })
        .eq('id', existing.id)
        .select('*')
        .single());
    } else {
      // Insert new
      ({ data, error } = await supabaseAdmin!
        .from('monthly_statements')
        .insert([{ year, month, attachment_url, attachment_name }])
        .select('*')
        .single());
    }

    if (error) {
      console.error('Error upserting monthly statement:', error);
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
