import { NextRequest, NextResponse } from 'next/server';

const LINQ_BASE = 'https://api.linqapp.com/api/partner/v3';

/**
 * POST /api/linq/send
 *
 * Two modes:
 *   a) Reply to existing chat:  { chat_id: string, message: string }
 *   b) New conversation:        { line_phone: string, contact_phone: string, message: string }
 *
 * In mode (b) a new Linq chat is created and the first message is sent.
 * Returns: { data: { chat_id, message_id }, error }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { chat_id, message, line_phone, contact_phone: rawPhone } = body;
    // Normalize phone to E.164 format
    const contact_phone = rawPhone ? '+1' + rawPhone.replace(/\D/g, '').replace(/^1/, '').slice(-10) : undefined;

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

    // ── Mode (b): create chat + send first message ────────────────────────────
    if (!chat_id && line_phone && contact_phone) {
      const createRes = await fetch(`${LINQ_BASE}/chats`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: line_phone,
          to: [contact_phone],
          message: {
            parts: [{ type: 'text', value: trimmed }],
          },
        }),
      });

      if (!createRes.ok) {
        const text = await createRes.text();
        console.error('[linq/send] createChat error:', createRes.status, text);
        return NextResponse.json(
          { data: null, error: `Linq returned ${createRes.status}: ${text}` },
          { status: createRes.status }
        );
      }

      const chat = await createRes.json();
      return NextResponse.json({
        data: { chat_id: chat.id, message_id: null },
        error: null,
      });
    }

    // ── Mode (a): send to existing chat ───────────────────────────────────────
    if (!chat_id || typeof chat_id !== 'string') {
      return NextResponse.json(
        { data: null, error: 'chat_id is required (or provide line_phone + contact_phone for a new chat)' },
        { status: 400 }
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
      console.error('[linq/send] sendMessage error:', res.status, text);
      return NextResponse.json(
        { data: null, error: `Linq returned ${res.status}: ${text}` },
        { status: res.status }
      );
    }

    const msg = await res.json();
    return NextResponse.json({
      data: { chat_id, message_id: msg.id ?? null },
      error: null,
    });
  } catch (err) {
    console.error('[linq/send] error:', err);
    return NextResponse.json(
      { data: null, error: String(err) },
      { status: 500 }
    );
  }
}
