import { NextRequest, NextResponse } from 'next/server';
import { ingestContactMatches, type IngestContact } from '@/lib/scout/contacts';

/**
 * POST /api/scout/contacts/match
 * Ingest permissioned contacts for a Scout member. Never returns the address book.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const memberId = typeof body.member_id === 'string' ? body.member_id : '';
    const scope = body.scope === 'full' ? 'full' : 'selective';
    const raw = Array.isArray(body.contacts) ? body.contacts : [];

    if (!memberId) {
      return NextResponse.json(
        { data: null, error: { message: 'member_id is required', code: 'MISSING_FIELDS' } },
        { status: 400 }
      );
    }

    const contacts: IngestContact[] = [];
    for (const row of raw.slice(0, 500)) {
      if (!row || typeof row !== 'object') continue;
      const rec = row as Record<string, unknown>;
      const name = typeof rec.name === 'string' ? rec.name.trim() : '';
      if (!name) continue;
      contacts.push({
        name,
        phone: typeof rec.phone === 'string' ? rec.phone : undefined,
        email: typeof rec.email === 'string' ? rec.email : undefined,
        reachable_sms: typeof rec.reachable_sms === 'boolean' ? rec.reachable_sms : undefined,
      });
    }

    const result = await ingestContactMatches({ memberId, scope, contacts });
    return NextResponse.json({
      data: {
        grant_id: result.grant_id,
        matched: result.matched,
        unmatched: result.unmatched,
        invites_suggested: result.invites_suggested,
        ingested: contacts.length,
      },
      error: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[POST /api/scout/contacts/match]', message);
    const code =
      message === 'profile_not_found'
        ? 'NOT_FOUND'
        : message === 'db_not_configured'
          ? 'DB_NOT_CONFIGURED'
          : 'INTERNAL_ERROR';
    return NextResponse.json(
      { data: null, error: { message, code } },
      { status: code === 'NOT_FOUND' ? 404 : 500 }
    );
  }
}
