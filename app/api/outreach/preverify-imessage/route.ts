import { NextResponse } from 'next/server';

/**
 * DEPRECATED — Linq V3 API requires at least one message part when creating a chat.
 * Empty chat creation (no message) returns HTTP 400: "at least one message part is required".
 * 
 * Pre-verification via empty chat is not supported by Linq.
 * 
 * iMessage detection is now handled in Phase B of the execute route:
 *   app/api/outreach/batches/[id]/execute/route.ts
 *
 * Phase B sends the T1 message, waits 10s, reads resolved service type,
 * and reverts SMS contacts to pre-send state + marks is_imessage=false permanently.
 */

export async function POST() {
  return NextResponse.json({
    deprecated: true,
    message: 'Pre-verification via empty chat is not supported by Linq V3 API. iMessage detection happens in Phase B of the execute route.',
    verified: 0,
    imessage: 0,
    sms: 0,
    errors: 0,
  });
}
