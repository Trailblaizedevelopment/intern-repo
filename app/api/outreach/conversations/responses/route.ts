import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const LINES = [
  { number: 1, label: 'Owen' },
  { number: 2, label: 'Adam' },
  { number: 3, label: 'Ford' },
] as const;

/**
 * GET /api/outreach/conversations/responses
 * Returns alumni contacts that have responded (last_response_at IS NOT NULL),
 * sorted by most recent response. Used for the human-in-the-loop response inbox.
 *
 * Query params:
 *   ?line=1|2|3   — filter by assigned sending line (optional)
 *   ?handled=true — include handled conversations (default: false, only unhandled)
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { data: [], error: { message: 'Platform database not configured', code: 'DB_ERROR' } },
      { status: 500 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const lineFilter = searchParams.get('line');
    const includeHandled = searchParams.get('handled') === 'true';

    // Base query: contacts with at least one inbound response
    let query = supabase
      .from('alumni_contacts')
      .select(`
        id,
        first_name,
        last_name,
        year,
        phone_primary,
        outreach_status,
        last_response_at,
        last_response_text,
        response_classification,
        linq_chat_id,
        assigned_line,
        flagged,
        flagged_reason,
        chapter_id,
        chapters!inner(chapter_name)
      `)
      .not('last_response_at', 'is', null)
      .order('last_response_at', { ascending: false })
      .limit(100);

    // Filter by line
    if (lineFilter) {
      query = query.eq('assigned_line', parseInt(lineFilter));
    }

    // Filter out handled conversations unless explicitly requested
    // handled_at column may not exist — gracefully skip if so
    if (!includeHandled) {
      query = query.is('handled_at', null);
    }

    const { data, error } = await query;

    // If handled_at column doesn't exist, fall back without that filter
    if (error && error.message?.includes('handled_at')) {
      const fallbackQuery = supabase
        .from('alumni_contacts')
        .select(`
          id,
          first_name,
          last_name,
          year,
          phone_primary,
          outreach_status,
          last_response_at,
          last_response_text,
          response_classification,
          linq_chat_id,
          assigned_line,
          flagged,
          flagged_reason,
          chapter_id,
          chapters!inner(chapter_name)
        `)
        .not('last_response_at', 'is', null)
        .order('last_response_at', { ascending: false })
        .limit(100);

      if (lineFilter) {
        fallbackQuery.eq('assigned_line', parseInt(lineFilter));
      }

      const { data: fallbackData, error: fallbackError } = await fallbackQuery;
      if (fallbackError) throw new Error(fallbackError.message);

      return NextResponse.json({
        data: transformContacts(fallbackData || []),
        handled_at_missing: true, // signal to UI that migration is needed
      });
    }

    if (error) throw new Error(error.message);

    return NextResponse.json({
      data: transformContacts(data || []),
      handled_at_missing: false,
    });
  } catch (err) {
    console.error('Error fetching response inbox:', err);
    return NextResponse.json(
      { data: [], error: { message: 'Failed to fetch responses', code: 'SERVER_ERROR' } },
      { status: 500 }
    );
  }
}

type RawContact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  year: number | null;
  phone_primary: string | null;
  outreach_status: string | null;
  last_response_at: string | null;
  last_response_text: string | null;
  response_classification: string | null;
  linq_chat_id: string | null;
  assigned_line: number | null;
  flagged: boolean | null;
  flagged_reason: string | null;
  chapter_id: string;
  chapters: { chapter_name: string } | { chapter_name: string }[] | null;
};

function transformContacts(contacts: RawContact[]) {
  return contacts.map(c => {
    const lineInfo = c.assigned_line
      ? LINES.find(l => l.number === c.assigned_line)
      : null;

    // Handle both single join and array join from Supabase
    const chapterName = Array.isArray(c.chapters)
      ? c.chapters[0]?.chapter_name ?? 'Unknown'
      : c.chapters?.chapter_name ?? 'Unknown';

    return {
      contact_id: c.id,
      contact_name: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown',
      first_name: c.first_name,
      last_name: c.last_name,
      grad_year: c.year,
      chapter_name: chapterName,
      chapter_id: c.chapter_id,
      line_number: c.assigned_line,
      line_label: lineInfo?.label ?? `Line ${c.assigned_line}`,
      last_response_text: c.last_response_text,
      last_response_at: c.last_response_at,
      linq_chat_id: c.linq_chat_id,
      outreach_status: c.outreach_status,
      flagged: c.flagged ?? false,
      flagged_reason: c.flagged_reason,
      phone_primary: c.phone_primary,
      response_classification: c.response_classification,
    };
  });
}

/**
 * PATCH /api/outreach/conversations/responses
 * Mark a conversation as handled.
 * Body: { contact_id: string }
 *
 * NOTE: Requires `handled_at` column on alumni_contacts.
 * Migration SQL:
 *   ALTER TABLE alumni_contacts ADD COLUMN IF NOT EXISTS handled_at TIMESTAMPTZ;
 */
export async function PATCH(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: { message: 'Platform database not configured', code: 'DB_ERROR' } },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { contact_id, unhandle } = body;

    if (!contact_id) {
      return NextResponse.json(
        { error: { message: 'contact_id is required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('alumni_contacts')
      .update({ handled_at: unhandle ? null : new Date().toISOString() })
      .eq('id', contact_id);

    if (error) {
      if (error.message?.includes('handled_at')) {
        return NextResponse.json(
          {
            error: {
              message: 'handled_at column missing — run migration',
              migration_sql: 'ALTER TABLE alumni_contacts ADD COLUMN IF NOT EXISTS handled_at TIMESTAMPTZ;',
              code: 'SCHEMA_MISSING',
            },
          },
          { status: 422 }
        );
      }
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error marking conversation handled:', err);
    return NextResponse.json(
      { error: { message: 'Failed to update conversation', code: 'SERVER_ERROR' } },
      { status: 500 }
    );
  }
}
