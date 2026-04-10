import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/network-contacts
 * Returns all network contacts (fundraising / investor CRM).
 * Protected by INTERNAL_API_KEY via middleware.
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } }, { status: 500 });
    }

    const { data, error } = await supabase
      .from('network_contacts')
      .select('*')
      .order('priority', { ascending: true })
      .order('next_followup_date', { ascending: true });

    if (error) {
      console.error('[GET /api/network-contacts] DB error:', error);
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code || 'DB_ERROR' } }, { status: 500 });
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('[GET /api/network-contacts] Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}

/**
 * POST /api/network-contacts
 * Create one or many network contacts.
 * Body: single contact object OR { items: contact[] } for bulk.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } }, { status: 500 });
    }

    const body = await request.json();

    // ── Bulk insert path ──────────────────────────────────────────────
    if (Array.isArray(body.items)) {
      const items = body.items as Record<string, unknown>[];
      if (items.length === 0) {
        return NextResponse.json({ data: null, error: { message: 'items array is empty', code: 'VALIDATION_ERROR' } }, { status: 400 });
      }
      const toInsert = items.map(({ id: _id, created_at: _ca, updated_at: _ua, ...f }) => ({
        ...f,
        name: typeof f.name === 'string' ? f.name.trim() : f.name,
      }));
      const { data, error } = await supabase
        .from('network_contacts')
        .insert(toInsert)
        .select();
      if (error) {
        console.error('[POST /api/network-contacts bulk] DB error:', error);
        return NextResponse.json({ data: null, error: { message: error.message, code: error.code || 'DB_ERROR' } }, { status: 500 });
      }
      return NextResponse.json({ data, error: null }, { status: 201 });
    }

    // ── Single insert path ────────────────────────────────────────────
    if (!body.name?.trim()) {
      return NextResponse.json({ data: null, error: { message: 'name is required', code: 'VALIDATION_ERROR' } }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, created_at: _ca, updated_at: _ua, ...fields } = body;

    const { data, error } = await supabase
      .from('network_contacts')
      .insert([{ ...fields, name: fields.name.trim() }])
      .select()
      .single();

    if (error) {
      console.error('[POST /api/network-contacts] DB error:', error);
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code || 'DB_ERROR' } }, { status: 500 });
    }

    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/network-contacts] Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}
