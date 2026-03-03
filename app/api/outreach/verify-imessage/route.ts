import { NextRequest, NextResponse } from 'next/server';
import { messaging } from '@/lib/messaging';
import { SENDING_LINES } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { chapter_id, batch_size = 50 } = await request.json();

    if (!chapter_id) {
      return NextResponse.json(
        { data: null, error: { message: 'chapter_id is required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const result = await messaging.verifyChapter({
      chapter_id,
      line_phone: SENDING_LINES[0].phone,
      batch_size,
    });

    return NextResponse.json({
      data: {
        total_checked: result.verified + result.errors,
        imessage: result.imessage,
        sms: result.sms,
        errors: result.errors,
      },
      error: null,
    });
  } catch (err) {
    console.error('Error verifying iMessage:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Failed to verify iMessage eligibility', code: 'SERVER_ERROR' } },
      { status: 500 }
    );
  }
}
