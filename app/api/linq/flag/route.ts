import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * POST /api/linq/flag
 * Body: { contact_id: string, flagged: boolean, flagged_reason?: string }
 * Updates alumni_contacts.flagged + alumni_contacts.flagged_reason in Supabase.
 *
 * NOTE: Requires the following schema migration to be applied first:
 *   ALTER TABLE alumni_contacts ADD COLUMN IF NOT EXISTS flagged boolean DEFAULT false;
 *   ALTER TABLE alumni_contacts ADD COLUMN IF NOT EXISTS flagged_reason text;
 */
export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { data: null, error: 'Server configuration error' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { contact_id, flagged, flagged_reason } = body;

    if (!contact_id || typeof contact_id !== 'string') {
      return NextResponse.json(
        { data: null, error: 'contact_id is required' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('alumni_contacts')
      .update({
        flagged: flagged === false ? false : true,
        flagged_reason: flagged === false ? null : (flagged_reason?.trim() || null),
      })
      .eq('id', contact_id);

    if (error) {
      // Detect missing columns and surface a helpful error
      if (
        error.message?.includes('flagged') ||
        error.message?.includes('column') ||
        error.code === '42703'
      ) {
        return NextResponse.json(
          {
            data: null,
            error: 'Schema migration required',
            schema_required: true,
            migration: [
              'ALTER TABLE alumni_contacts ADD COLUMN IF NOT EXISTS flagged boolean DEFAULT false;',
              'ALTER TABLE alumni_contacts ADD COLUMN IF NOT EXISTS flagged_reason text;',
            ],
          },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { data: null, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: { success: true }, error: null });
  } catch (err) {
    console.error('[linq/flag] error:', err);
    return NextResponse.json(
      { data: null, error: String(err) },
      { status: 500 }
    );
  }
}
