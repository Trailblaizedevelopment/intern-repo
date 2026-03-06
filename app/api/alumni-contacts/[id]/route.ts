import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * PATCH /api/alumni-contacts/:id
 *
 * Updates outreach fields on a single alumni contact.
 * Protected by INTERNAL_API_KEY via middleware.
 *
 * Body: partial object with any of the allowed outreach fields.
 * Returns: the updated contact record.
 */

const VALID_OUTREACH_STATUSES = [
  'not_contacted',
  'touch1_sent',
  'touch1_confirmed',
  'touch1_wrong_number',
  'touch2_sent',
  'touch3_sent',
  'signed_up',
  'declined',
  'no_response',
] as const;

const ALLOWED_FIELDS: Record<string, 'string' | 'boolean' | 'number' | 'timestamp' | 'enum'> = {
  outreach_status:          'enum',
  is_imessage:              'boolean',
  assigned_line:            'number',
  linq_chat_id:             'string',
  touch1_sent_at:           'timestamp',
  touch2_sent_at:           'timestamp',
  touch3_sent_at:           'timestamp',
  last_response_at:         'timestamp',
  response_text:            'string',
  response_classification:  'string',
  flagged:                  'boolean',
  flagged_reason:           'string',
  signed_up_at:             'timestamp',
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } },
        { status: 500 }
      );
    }

    const { id } = params;
    if (!id) {
      return NextResponse.json(
        { data: null, error: { message: 'Contact ID is required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { data: null, error: { message: 'Invalid JSON body', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    // Sanitize: only allow known outreach fields
    const updates: Record<string, unknown> = {};

    for (const [key, type] of Object.entries(ALLOWED_FIELDS)) {
      if (!(key in body)) continue;
      const val = body[key];

      if (val === null) {
        updates[key] = null;
        continue;
      }

      if (type === 'enum') {
        if (!VALID_OUTREACH_STATUSES.includes(val as typeof VALID_OUTREACH_STATUSES[number])) {
          return NextResponse.json(
            {
              data: null,
              error: {
                message: `Invalid outreach_status: "${val}". Must be one of: ${VALID_OUTREACH_STATUSES.join(', ')}`,
                code: 'VALIDATION_ERROR',
              },
            },
            { status: 400 }
          );
        }
        updates[key] = val;
      } else if (type === 'boolean') {
        updates[key] = Boolean(val);
      } else if (type === 'number') {
        const n = Number(val);
        if (isNaN(n)) {
          return NextResponse.json(
            { data: null, error: { message: `${key} must be a number`, code: 'VALIDATION_ERROR' } },
            { status: 400 }
          );
        }
        updates[key] = n;
      } else {
        // string or timestamp — pass through as-is
        updates[key] = val;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { data: null, error: { message: 'No valid fields to update', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('alumni_contacts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { data: null, error: { message: 'Contact not found', code: 'NOT_FOUND' } },
          { status: 404 }
        );
      }
      console.error('[PATCH /api/alumni-contacts/:id] DB error:', error);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code || 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('[PATCH /api/alumni-contacts/:id] Unexpected error:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
