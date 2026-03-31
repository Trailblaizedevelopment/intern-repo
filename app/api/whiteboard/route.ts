import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export interface WhiteboardEntry {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  author_id: string | null;
  author_name: string;
  font_size: number;
  created_at: string;
}

/** GET - Fetch all whiteboard entries */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } },
        { status: 500 }
      );
    }

    const { data: entries, error } = await supabase
      .from('whiteboard_entries')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching whiteboard entries:', error);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: entries, error: null });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

/** POST - Create a new whiteboard entry */
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { text, x, y, color, author_id, author_name, font_size } = body;

    if (!text || typeof x !== 'number' || typeof y !== 'number') {
      return NextResponse.json(
        { data: null, error: { message: 'text, x, and y are required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('whiteboard_entries')
      .insert([{
        text: text.trim(),
        x,
        y,
        color: color || '#000000',
        author_id: author_id || null,
        author_name: author_name || 'Unknown',
        font_size: font_size || 28,
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating whiteboard entry:', error);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

/** DELETE - Clear all whiteboard entries (with confirmation via query param) */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const confirm = searchParams.get('confirm');

    if (confirm !== 'true') {
      return NextResponse.json(
        { data: null, error: { message: 'Must confirm deletion with ?confirm=true', code: 'CONFIRMATION_REQUIRED' } },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('whiteboard_entries')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) {
      console.error('Error clearing whiteboard:', error);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: { cleared: true }, error: null });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
