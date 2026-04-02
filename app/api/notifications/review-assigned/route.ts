import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';

interface ReviewNotificationPayload {
  ticketId: string;
  ticketTitle: string;
  priority: string;
  ticketType: 'web' | 'ios';
}

const REVIEW_TEAM = [
  { name: 'Owen', number: '+16018263085' },
  { name: 'Adam', number: '+16018326655' },
  { name: 'Ford', number: '+16462442696' },
];

function sendImsg(to: string, message: string): Promise<void> {
  return new Promise((resolve) => {
    const escaped = message.replace(/"/g, '\\"');
    const cmd = `imsg send --to ${to} --message "${escaped}"`;
    exec(cmd, (err) => {
      if (err) {
        console.warn(`[review-assigned] imsg failed for ${to}:`, err.message);
      }
      resolve(); // always resolve — notification failures are non-blocking
    });
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as ReviewNotificationPayload;
    const { ticketId, ticketTitle, priority, ticketType } = body;

    // Only send notifications for web tickets (Devin's queue)
    if (ticketType !== 'web') {
      return NextResponse.json({ ok: true, sent: false, reason: 'iOS tickets skip notifications' });
    }

    const message = `🔔 New ticket ready for review: ${ticketTitle} (${priority} priority). Check the dev board: https://trailblaize.space/workspace/development`;

    console.log(`[review-assigned] Sending notifications for ticket ${ticketId}: "${ticketTitle}"`);

    // Fire notifications concurrently — all non-blocking
    await Promise.allSettled(
      REVIEW_TEAM.map(member => sendImsg(member.number, message))
    );

    return NextResponse.json({ ok: true, sent: true, recipients: REVIEW_TEAM.map(m => m.name) });
  } catch (err) {
    // Notification errors must never propagate to the client as a hard failure
    console.error('[review-assigned] Unexpected error:', err);
    return NextResponse.json({ ok: true, sent: false, reason: 'internal error' });
  }
}
