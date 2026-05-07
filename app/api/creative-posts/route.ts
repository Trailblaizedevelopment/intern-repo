import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// GET - List creative posts
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    let query = supabase
      .from('creative_posts')
      .select('*')
      .order('post_date', { ascending: true })
      .order('created_at', { ascending: false });

    if (startDate) query = query.gte('post_date', startDate);
    if (endDate) query = query.lte('post_date', endDate);

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching creative posts:', error);
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}

// POST - Create creative post
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } }, { status: 500 });
    }

    const body = await request.json();
    const { post_date, content_type, caption, link, notes } = body;

    if (!post_date || !content_type) {
      return NextResponse.json({ data: null, error: { message: 'post_date and content_type are required', code: 'VALIDATION_ERROR' } }, { status: 400 });
    }

    const validTypes = ['real_person', 'ai_influencer', 'ai_pictures'];
    if (!validTypes.includes(content_type)) {
      return NextResponse.json({ data: null, error: { message: 'Invalid content_type', code: 'VALIDATION_ERROR' } }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('creative_posts')
      .insert([{ post_date, content_type, caption, link, notes }])
      .select()
      .single();

    if (error) {
      console.error('Error creating creative post:', error);
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}

// DELETE - Delete a creative post
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ data: null, error: { message: 'id is required', code: 'VALIDATION_ERROR' } }, { status: 400 });
    }

    const { error } = await supabase
      .from('creative_posts')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting creative post:', error);
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    }

    return NextResponse.json({ data: { success: true }, error: null });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}
