import { NextRequest, NextResponse } from 'next/server';
import { getMessages } from '@/lib/linq';

/**
 * GET /api/linq/messages?chat_id=...&limit=...
 * Server-side proxy to fetch Linq message thread.
 * Token never hits the client.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get('chat_id');
    const limit = parseInt(searchParams.get('limit') || '50');

    if (!chatId) {
      return NextResponse.json(
        { data: null, error: { message: 'chat_id is required' } },
        { status: 400 }
      );
    }

    const messages = await getMessages(chatId, limit);

    return NextResponse.json({ data: messages, error: null });
  } catch (err) {
    console.error('[linq/messages] error:', err);
    return NextResponse.json(
      { data: null, error: { message: String(err) } },
      { status: 500 }
    );
  }
}
