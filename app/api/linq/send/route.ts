import { NextRequest, NextResponse } from 'next/server';

const LINQ_BASE = 'https://api.linqapp.com/api/partner/v3';

/**
 * POST /api/linq/send
 * Body: { chat_id: string, message: string }
 * Proxies a reply to an existing Linq chat.
 * The Linq API token is never exposed to the client.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { chat_id, message } = body;

    if (!chat_id || typeof chat_id !== 'string') {
      return NextResponse.json(
        { data: null, error: 'chat_id is required' },
        { status: 400 }
      );
    }

    const trimmed = (message || '').trim();
    if (!trimmed) {
      return NextResponse.json(
        { data: null, error: 'message cannot be empty' },
        { status: 400 }
      );
    }

    const token = process.env.LINQ_API_TOKEN;
    if (!token) {
      return NextResponse.json(
        { data: null, error: 'Linq API not configured' },
        { status: 500 }
      );
    }

    const res = await fetch(`${LINQ_BASE}/chats/${chat_id}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          parts: [{ type: 'text', value: trimmed }],
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('[linq/send] Linq error:', res.status, text);
      return NextResponse.json(
        { data: null, error: `Linq returned ${res.status}: ${text}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('[linq/send] error:', err);
    return NextResponse.json(
      { data: null, error: String(err) },
      { status: 500 }
    );
  }
}
