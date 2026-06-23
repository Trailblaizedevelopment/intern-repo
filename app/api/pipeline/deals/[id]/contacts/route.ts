import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// POST — add a contact to a deal
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const { contact_id, is_primary } = await req.json();
  if (!contact_id) return NextResponse.json({ error: 'contact_id required' }, { status: 400 });

  // If setting as primary, unset existing primary first
  if (is_primary) {
    await admin.from('deal_contacts').update({ is_primary: false }).eq('deal_id', params.id);
  }

  const { data, error } = await admin
    .from('deal_contacts')
    .upsert({ deal_id: params.id, contact_id, is_primary: is_primary ?? false }, { onConflict: 'deal_id,contact_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// DELETE — remove a contact from a deal
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const { contact_id } = await req.json();
  const { error } = await admin
    .from('deal_contacts')
    .delete()
    .eq('deal_id', params.id)
    .eq('contact_id', contact_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
