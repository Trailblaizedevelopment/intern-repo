// PATCH: update any allowed field on a ticket
// Next.js 15: params is a Promise
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const body = await req.json() as Record<string, unknown>;

  // Allowlist — never pass arbitrary user data to the DB
  const allowed = ['due_date', 'status', 'priority', 'sprint', 'assignee_id'] as const;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }

  if (Object.keys(update).length === 1) {
    // Only updated_at — nothing to update
    return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('tickets')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
