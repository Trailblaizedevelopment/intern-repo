import { NextRequest, NextResponse } from 'next/server';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const AUTH_TOKEN = 'hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h';

const SYSTEM_PROMPT =
  "You are a technical product manager for Trailblaize, an alumni relationship management SaaS for Greek life chapters. " +
  "Generate a concise, buildable ticket spec from the following feature request. " +
  'Return JSON with: title (string), description (string), acceptance_criteria (array of strings), edge_cases (array of strings), complexity ("Small"|"Medium"|"Large").';

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!auth?.includes(AUTH_TOKEN)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 });
  }

  try {
    const body = await request.json() as { description?: string };
    const { description } = body;

    if (!description?.trim()) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: description.trim(),
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as Record<string, unknown>;
      throw new Error((err.error as { message?: string })?.message || `Anthropic API error: ${response.status}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>;
    };

    const textContent = data.content.find(c => c.type === 'text');
    if (!textContent) throw new Error('No text content in response');

    // Parse JSON from the response (Claude may include markdown fences)
    const raw = textContent.text.trim();
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/) || [null, raw];
    const jsonStr = jsonMatch[1] || raw;

    let spec: {
      title: string;
      description: string;
      acceptance_criteria: string[];
      edge_cases: string[];
      complexity: 'Small' | 'Medium' | 'Large';
    };

    try {
      spec = JSON.parse(jsonStr);
    } catch {
      throw new Error('Failed to parse spec JSON from Claude response');
    }

    return NextResponse.json({ spec });
  } catch (error) {
    console.error('Error generating spec:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate spec' },
      { status: 500 }
    );
  }
}
