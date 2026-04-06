/**
 * POST /api/conversations/sync-all
 * Full recovery sync — runs the linq-recovery logic.
 * Pulls all chats across all lines, full pagination, full enrichment.
 *
 * Requires: Authorization: Bearer <internal_token>
 */

import { NextRequest, NextResponse } from 'next/server';
import { runLinqRecovery } from '@/lib/linq-recovery';

const INTERNAL_TOKEN = process.env.INTERNAL_API_KEY || '';

function checkAuth(req: NextRequest): boolean {
  return (req.headers.get('Authorization') || '') === `Bearer ${INTERNAL_TOKEN}`;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runLinqRecovery();
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error('[conversations/sync-all]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
