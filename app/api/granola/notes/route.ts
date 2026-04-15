import { NextResponse } from 'next/server';

// Fetches notes from a single Granola API key
async function fetchGranolaNotes(apiKey: string): Promise<any[]> {
  const res = await fetch('https://public-api.granola.ai/v1/notes', {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    console.error('[granola] API error for key:', res.status);
    return [];
  }
  const data = await res.json();
  return Array.isArray(data) ? data : (data.notes ?? []);
}

export async function GET() {
  // Support multiple Granola accounts — Owen, Ford, Adam
  // Add GRANOLA_API_KEY_ADAM and GRANOLA_API_KEY_FORD to Vercel env vars
  const keys = [
    process.env.GRANOLA_API_KEY,
    process.env.GRANOLA_API_KEY_FORD,
    process.env.GRANOLA_API_KEY_ADAM,
  ].filter(Boolean) as string[];

  if (keys.length === 0) {
    return NextResponse.json({ notes: [] });
  }

  try {
    // Fetch from all available keys in parallel
    const results = await Promise.allSettled(keys.map(k => fetchGranolaNotes(k)));
    
    const allNotes: any[] = [];
    const seenIds = new Set<string>();

    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const note of result.value) {
          // Deduplicate by ID (same meeting may appear in multiple accounts)
          if (note.id && !seenIds.has(note.id)) {
            seenIds.add(note.id);
            allNotes.push(note);
          }
        }
      }
    }

    // Sort by created_at DESC
    allNotes.sort(
      (a, b) =>
        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

    return NextResponse.json({ notes: allNotes });
  } catch (err) {
    console.error('[granola] fetch error:', err);
    return NextResponse.json({ notes: [], error: 'Failed to reach Granola API' });
  }
}
