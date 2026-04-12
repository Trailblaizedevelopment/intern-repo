import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

interface PortalMessageRow {
  id: string;
  sender_id: string;
  recipient_id: string | null;
  subject: string;
  body: string | null;
  is_draft: boolean;
  is_read: boolean;
  is_starred: boolean | null;
  is_archived: boolean | null;
  sent_at: string;
  thread_id?: string | null;
  sender?: { name: string; email: string } | null;
  [key: string]: unknown;
}

/**
 * GET /api/portal/messages
 * Params:
 *   employee_id   - required for inbox; used as recipient_id for inbox, sender_id for sent/drafts
 *   tab           - 'inbox' | 'sent' | 'starred' | 'drafts' (default: inbox)
 *   is_read       - optional, 'true' | 'false' — filter by read status
 *   is_draft      - optional, 'true' | 'false'
 *   limit         - optional
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employee_id');
    const tab = searchParams.get('tab') || 'inbox';
    const isRead = searchParams.get('is_read');
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;

    if (!employeeId) {
      return NextResponse.json(
        { data: null, error: { message: 'employee_id is required', code: 'MISSING_PARAM' } },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { data: null, error: { message: 'Database not configured', code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
      .from('portal_messages')
      .select(`*, sender:sender_id(name, email)`);

    switch (tab) {
      case 'inbox':
        query = query
          .eq('recipient_id', employeeId)
          .eq('is_archived', false)
          .eq('is_draft', false);
        break;
      case 'sent':
        query = query
          .eq('sender_id', employeeId)
          .eq('is_draft', false);
        break;
      case 'starred':
        query = query
          .or(`sender_id.eq.${employeeId},recipient_id.eq.${employeeId}`)
          .eq('is_starred', true);
        break;
      case 'drafts':
        query = query
          .eq('sender_id', employeeId)
          .eq('is_draft', true);
        break;
      default:
        // unread only (for dashboard preview)
        query = query
          .eq('recipient_id', employeeId)
          .eq('is_read', false)
          .eq('is_draft', false);
        break;
    }

    if (isRead !== null && isRead !== undefined && isRead !== '') {
      query = query.eq('is_read', isRead === 'true');
    }

    if (limit) {
      query = query.limit(limit);
    }

    query = query.order('sent_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching portal messages:', error);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    // Normalize sender join
    const normalized = (data as PortalMessageRow[] || []).map((m) => ({
      ...m,
      sender_name: m.sender?.name || 'Unknown',
      sender_email: m.sender?.email || '',
    }));

    return NextResponse.json({ data: normalized, error: null });
  } catch (error) {
    console.error('Portal messages GET error:', error);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/portal/messages
 * Send or save a draft message
 * Body: { sender_id, recipient_id, subject, body, is_draft? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sender_id, recipient_id, subject, body: messageBody, is_draft } = body;

    if (!sender_id) {
      return NextResponse.json(
        { data: null, error: { message: 'sender_id is required', code: 'MISSING_PARAM' } },
        { status: 400 }
      );
    }

    if (!is_draft && !recipient_id) {
      return NextResponse.json(
        { data: null, error: { message: 'recipient_id is required for non-draft messages', code: 'MISSING_PARAM' } },
        { status: 400 }
      );
    }

    const supabasePost = getSupabaseAdmin();
    if (!supabasePost) {
      return NextResponse.json(
        { data: null, error: { message: 'Database not configured', code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    const { data, error } = await supabasePost
      .from('portal_messages')
      .insert({
        sender_id,
        recipient_id: recipient_id || null,
        subject: subject || '(No subject)',
        body: messageBody || null,
        is_draft: is_draft || false,
        thread_id: crypto.randomUUID(),
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating portal message:', error);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (error) {
    console.error('Portal messages POST error:', error);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/portal/messages
 * Update a message (mark read, star, archive, delete)
 * Body: { id, is_read?, is_starred?, is_archived?, delete? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...rest } = body;

    if (!id) {
      return NextResponse.json(
        { data: null, error: { message: 'id is required', code: 'MISSING_PARAM' } },
        { status: 400 }
      );
    }

    const supabasePatch = getSupabaseAdmin();
    if (!supabasePatch) {
      return NextResponse.json(
        { data: null, error: { message: 'Database not configured', code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    // Handle delete
    if (rest.delete === true) {
      const { error } = await supabasePatch
        .from('portal_messages')
        .delete()
        .eq('id', id);

      if (error) {
        return NextResponse.json(
          { data: null, error: { message: error.message, code: 'DB_ERROR' } },
          { status: 500 }
        );
      }
      return NextResponse.json({ data: { deleted: true }, error: null });
    }

    const allowedFields = ['is_read', 'is_starred', 'is_archived', 'read_at'];
    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (rest[field] !== undefined) updates[field] = rest[field];
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { data: null, error: { message: 'No valid fields to update', code: 'INVALID_UPDATE' } },
        { status: 400 }
      );
    }

    const { data, error } = await supabasePatch
      .from('portal_messages')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message, code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (error) {
    console.error('Portal messages PATCH error:', error);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
