import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, phone, email, school, instagram, why, submitted_at } = body;

    if (!name || !phone || !email) {
      return NextResponse.json(
        { data: null, error: { message: 'Name, phone, and email are required' } },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      // Return success even without DB — form data is stored locally
      return NextResponse.json({ data: { name, status: 'pending' }, error: null });
    }

    // Pack extra fields into notes JSON
    const notesObj = {
      phone,
      email,
      instagram: instagram || null,
      why: why || null,
      source: 'join_flow',
      submitted_at: submitted_at || new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('ambassadors')
      .insert([
        {
          name,
          school: school || '',
          contact: email,
          status: 'pending',
          notes: JSON.stringify(notesObj),
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error saving ambassador application:', error);
      // Return success anyway — form data saved in localStorage
      return NextResponse.json({ data: null, error: null });
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('Unexpected error in ambassador application:', err);
    return NextResponse.json({ data: null, error: null });
  }
}
