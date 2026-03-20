/**
 * PATCH /api/conversations/[id]
 * Update status, flagged_reason, or has_unread_reply on a conversation.
 *
 * Body: { status?, flagged_reason?, has_unread_reply? }
 * Requires: Authorization: Bearer <internal_token>
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const INTERNAL_TOKEN = 'hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h';

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('Authorization') || '';
  return auth === `Bearer ${INTERNAL_TOKEN}`;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'DB not configured' }, { status: 500 });
  }

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const allowedFields = ['status', 'flagged_reason', 'has_unread_reply'];
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  for (const field of allowedFields) {
    if (field in body) {
      update[field] = body[field];
    }
  }

  const { data, error } = await supabase
    .from('linq_conversations')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
