import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/email-templates
 * Returns all email templates, ordered by created_at desc.
 * Optional: ?category=onboarding  ?search=welcome
 *
 * POST /api/email-templates
 * Creates a new template.
 * Body: { name, html_content, category?, subject_line?, description?, tags? }
 */

export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_ERROR' } }, { status: 500 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const search   = searchParams.get('search');

    let query = supabase
      .from('email_templates')
      .select('id, name, description, category, subject_line, tags, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (category) query = query.eq('category', category);
    if (search)   query = query.ilike('name', `%${search}%`);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    }

    return NextResponse.json({ data: data || [], error: null });
  } catch (err) {
    console.error('[GET /api/email-templates]', err);
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
    const { name, html_content, category, subject_line, description, tags } = body;

    if (!name?.trim()) {
      return NextResponse.json({ data: null, error: { message: 'name is required', code: 'VALIDATION_ERROR' } }, { status: 400 });
    }
    if (!html_content?.trim()) {
      return NextResponse.json({ data: null, error: { message: 'html_content is required', code: 'VALIDATION_ERROR' } }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('email_templates')
      .insert([{
        name:         name.trim(),
        html_content: html_content.trim(),
        category:     category     || 'onboarding',
        subject_line: subject_line || null,
        description:  description  || null,
        tags:         Array.isArray(tags) ? tags : null,
      }])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    }

    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/email-templates]', err);
    return NextResponse.json({ data: null, error: { message: 'Server error', code: 'SERVER_ERROR' } }, { status: 500 });
  }
}
