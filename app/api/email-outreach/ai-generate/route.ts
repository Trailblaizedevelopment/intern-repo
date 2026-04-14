import { NextRequest, NextResponse } from 'next/server';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT = `You are an expert email designer and copywriter for Greek life alumni engagement. You produce beautiful, converting HTML emails for chapters using the Trailblaize platform.

Brand guidelines:
- Logo: https://trailblaize.space/logos/logo-wordmark-color.png
- Primary color: #1B2A4A (navy)
- Accent color: #C4874A (amber/gold)
- Background: #F8F6F2 (warm off-white)
- Font: system-ui, -apple-system, Georgia, serif
- Footer: "Powered by Trailblaize · trailblaize.net"

Technical requirements:
- Table-based layout for email client compatibility
- Max-width: 600px, centered
- ALL CSS must be inline (no <style> tags — email clients strip them)
- Mobile-responsive using media queries in a <style> tag is acceptable
- Must render beautifully in Gmail, Apple Mail, and Outlook
- Include a proper email header with the Trailblaize logo
- Include a footer with unsubscribe link placeholder

Output ONLY the complete HTML email. No explanation, no markdown code fences, no commentary — just the raw HTML starting with <!DOCTYPE html>.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured. Please add it to your environment variables.' },
      { status: 400 }
    );
  }

  let body: { prompt?: string; chapter_name?: string; chapter_type?: string; purpose?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { prompt, chapter_name, chapter_type, purpose } = body;

  if (!prompt) {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
  }

  const userMessage = [
    chapter_name ? `Chapter: ${chapter_name}` : null,
    chapter_type ? `Chapter type: ${chapter_type}` : null,
    purpose ? `Purpose: ${purpose}` : null,
    `Email description: ${prompt}`,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: userMessage,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', response.status, errText);
      return NextResponse.json(
        { error: `AI service error: ${response.status}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const html = data.content?.[0]?.text;

    if (!html) {
      return NextResponse.json({ error: 'No content returned from AI' }, { status: 502 });
    }

    return NextResponse.json({ html });
  } catch (err) {
    console.error('ai-generate error:', err);
    return NextResponse.json({ error: 'Failed to generate email' }, { status: 500 });
  }
}
