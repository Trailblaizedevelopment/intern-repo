import { NextRequest, NextResponse } from 'next/server';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT = `You polish raw call notes for a college alumni outreach team (Connect Center).

Rules:
- Consolidate fragmented / shorthand notes into clean, readable prose
- Preserve every factual detail: names, companies, roles, interests, follow-ups, commitments, objections
- Use short paragraphs or light bullets when it improves scanability
- Fix grammar, spelling, and punctuation
- Do NOT invent details that are not in the input
- Do NOT add titles, greetings, or meta commentary
- Output ONLY the polished notes as plain text (no markdown fences)`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { data: null, error: { message: 'ANTHROPIC_API_KEY not configured', code: 'CONFIG' } },
      { status: 400 }
    );
  }

  let body: { notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { data: null, error: { message: 'Invalid JSON body', code: 'INVALID_JSON' } },
      { status: 400 }
    );
  }

  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  if (!notes) {
    return NextResponse.json(
      { data: null, error: { message: 'notes is required', code: 'EMPTY_NOTES' } },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Polish these call notes:\n\n${notes}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[POST /api/call-logs/polish-notes] Anthropic error:', response.status, errText);
      return NextResponse.json(
        { data: null, error: { message: `AI service error: ${response.status}`, code: 'AI_ERROR' } },
        { status: 502 }
      );
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const polished = data.content?.find((c) => c.type === 'text')?.text?.trim();

    if (!polished) {
      return NextResponse.json(
        { data: null, error: { message: 'No content returned from AI', code: 'EMPTY_RESPONSE' } },
        { status: 502 }
      );
    }

    return NextResponse.json({ data: { notes: polished }, error: null });
  } catch (err) {
    console.error('[POST /api/call-logs/polish-notes]', err);
    return NextResponse.json(
      { data: null, error: { message: 'Failed to polish notes', code: 'INTERNAL' } },
      { status: 500 }
    );
  }
}
