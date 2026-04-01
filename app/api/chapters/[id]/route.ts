import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * PATCH /api/chapters/[id]
 * Update writable fields on a chapter, including onboarding_completed.
 *
 * Body: any subset of chapter fields to update.
 * The following sensitive fields are stripped and cannot be updated via this endpoint:
 *   id, created_at
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: chapterId } = await params;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 500 });
  }

  const body = await req.json();

  // Strip immutable fields
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, created_at: _created_at, ...updates } = body;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('chapters')
    .update(updates)
    .eq('id', chapterId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

/**
 * DELETE /api/chapters/[id]
 * Hard-delete a chapter and all cascade-related records.
 * Requires a confirmation header to prevent accidental calls.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: chapterId } = await params;

  // Require explicit confirmation header (belt-and-suspenders on top of the UI flow)
  const confirm = req.headers.get('x-confirm-delete');
  if (confirm !== 'CONFIRMED') {
    return NextResponse.json(
      { error: 'Missing confirmation header' },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 500 });
  }

  // Verify chapter exists first
  const { data: chapter, error: fetchErr } = await supabase
    .from('chapters')
    .select('id, chapter_name')
    .eq('id', chapterId)
    .single();

  if (fetchErr || !chapter) {
    return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
  }

  // Delete — FK ON DELETE CASCADE handles: alumni_contacts, chapter_tasks,
  // chapter_check_ins, check_in_action_items, chapter_members, linq_conversations, etc.
  const { error: deleteErr } = await supabase
    .from('chapters')
    .delete()
    .eq('id', chapterId);

  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    deleted: chapter.chapter_name,
  });
}
