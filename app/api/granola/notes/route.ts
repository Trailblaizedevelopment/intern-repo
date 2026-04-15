import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.GRANOLA_API_KEY;

  if (!apiKey) {
    // Return empty array gracefully — no key configured
    return NextResponse.json({ notes: [] });
  }

  try {
    const res = await fetch('https://public-api.granola.ai/v1/notes', {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      // Don't cache — this is a live feed
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text().catch(() => 'unknown error');
      console.error('[granola] API error:', res.status, text);
      return NextResponse.json({ notes: [], error: `Granola API ${res.status}` });
    }

    const data = await res.json();
    // Granola returns { notes: [...] } or just an array — handle both
    const notes = Array.isArray(data) ? data : (data.notes ?? []);

    // Sort by created_at DESC
    notes.sort(
      (a: { created_at?: string }, b: { created_at?: string }) =>
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

    return NextResponse.json({ notes });
  } catch (err) {
    console.error('[granola] fetch error:', err);
    return NextResponse.json({ notes: [], error: 'Failed to reach Granola API' });
  }
}
