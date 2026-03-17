import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl        = process.env.NEXT_PUBLIC_SUPABASE_URL       || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY      || '';

function getAdmin() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
}

/** True if the error is a "column X does not exist" Postgres error */
function isColumnNotExistError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const msg = (err as { message?: string }).message || '';
  return msg.includes('column') && msg.includes('does not exist');
}

export async function GET(request: NextRequest) {
  const chapter_id = request.nextUrl.searchParams.get('chapter_id');
  if (!chapter_id) return NextResponse.json({ error: 'chapter_id required' }, { status: 400 });

  const db = getAdmin();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const { data, error } = await db
    .from('chapter_members')
    .select('*')
    .eq('chapter_id', chapter_id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const db = getAdmin();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  // Try full insert first (including alumni fields)
  const { data, error } = await db
    .from('chapter_members')
    .insert([body])
    .select()
    .single();

  if (error) {
    if (isColumnNotExistError(error)) {
      // Migration not yet applied — fall back to base fields only.
      // Encode extra alumni data in notes so it isn't lost.
      const memberType: string = body.member_type || 'active';
      const extraInfo = memberType === 'alumni'
        ? [
            body.job_role ? `Role: ${body.job_role}` : '',
            body.company  ? `@ ${body.company}`      : '',
            body.is_hiring ? '| Hiring'              : '',
          ].filter(Boolean).join(' ').trim()
        : '';

      const fallbackPayload = {
        chapter_id:      body.chapter_id,
        name:            body.name,
        grad_year:       body.grad_year ?? null,
        major:           body.major ?? null,
        career_interest: body.career_interest ?? null,
        status:          body.status,
        notes:           [body.notes, extraInfo].filter(Boolean).join(' | ') || null,
      };

      const { data: fallbackData, error: fallbackError } = await db
        .from('chapter_members')
        .insert([fallbackPayload])
        .select()
        .single();

      if (fallbackError) return NextResponse.json({ error: fallbackError.message }, { status: 500 });
      // Return with a flag so the UI can show the migration banner
      return NextResponse.json({ data: fallbackData, migration_pending: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const db = getAdmin();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  // Try full update first (including alumni fields)
  const { data, error } = await db
    .from('chapter_members')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (isColumnNotExistError(error)) {
      // Migration not yet applied — strip alumni-only fields and retry
      const { member_type, job_role, company, is_hiring, ...baseUpdates } = updates as Record<string, unknown>;
      void member_type; void job_role; void company; void is_hiring;

      const { data: fallbackData, error: fallbackError } = await db
        .from('chapter_members')
        .update({ ...baseUpdates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (fallbackError) return NextResponse.json({ error: fallbackError.message }, { status: 500 });
      return NextResponse.json({ data: fallbackData, migration_pending: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const db = getAdmin();
  if (!db) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const { error } = await db.from('chapter_members').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
