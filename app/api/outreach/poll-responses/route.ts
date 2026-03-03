import { NextRequest, NextResponse } from 'next/server';
import { messaging } from '@/lib/messaging';

export async function POST(request: NextRequest) {
  try {
    const { chapter_id, batch_size = 100 } = await request.json();

    if (!chapter_id) {
      return NextResponse.json(
        { data: null, error: { message: 'chapter_id is required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const result = await messaging.pollResponses({ chapter_id });

    return NextResponse.json({
      data: {
        polled: result.polled,
        new_responses: result.new_responses,
        by_classification: result.classifications,
      },
      error: null,
    });
  } catch (err) {
    console.error('Error polling responses:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Failed to poll responses', code: 'SERVER_ERROR' } },
      { status: 500 }
    );
  }
}
