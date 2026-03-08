import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET    /api/email-templates/[id]  → single template (full html_content)
 * PATCH  /api/email-templates/[id]  → update fields
 * DELETE /api/email-templates/[id]  → delete
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_ERROR' } }, { status: 500 });
  }

  try {
    const { id }    = await params;
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 404 });
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('[GET /api/email-templates/[id]]', err);
    return NextResponse.json({ data: null, error: { message: 'Server error', code: 'SERVER_ERROR' } }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_ERROR' } }, { status: 500 });
  }

  try {
    const { id }   = await params;
    const body     = await request.json();

    const allowed = ['name', 'description', 'category', 'subject_line', 'html_content', 'tags'] as const;
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ data: null, error: { message: 'No updatable fields provided', code: 'VALIDATION_ERROR' } }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('email_templates')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('[PATCH /api/email-templates/[id]]', err);
    return NextResponse.json({ data: null, error: { message: 'Server error', code: 'SERVER_ERROR' } }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_ERROR' } }, { status: 500 });
  }

  try {
    const { id }    = await params;
    const { error } = await supabase
      .from('email_templates')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    }

    return NextResponse.json({ data: { deleted: id }, error: null });
  } catch (err) {
    console.error('[DELETE /api/email-templates/[id]]', err);
    return NextResponse.json({ data: null, error: { message: 'Server error', code: 'SERVER_ERROR' } }, { status: 500 });
  }
}
