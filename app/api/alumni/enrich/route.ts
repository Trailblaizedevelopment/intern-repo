/**
 * POST /api/alumni/enrich
 *
 * Uses Perplexity Sonar to find the current job title, company, and location
 * for alumni contacts and writes the results back to Supabase.
 *
 * Body: { chapter_id: string, contact_ids?: string[], limit?: number }
 * - contact_ids: enrich specific contacts (max 25)
 * - limit: max unenriched contacts to process in one run (default 25, max 30)
 *
 * Requires: PERPLEXITY_API_KEY env var
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const maxDuration = 300; // Vercel Pro — enrichment takes ~1.2s/contact

const PPLX_API_KEY = process.env.PERPLEXITY_API_KEY;
const PPLX_DELAY_MS = 1300; // ~1.3s between calls to stay well under rate limits

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

interface EnrichResult {
  title: string;
  company: string;
  location: string;
  confidence: 'high' | 'medium' | 'low' | 'not_found' | 'error';
  notes: string;
}

async function enrichPerson(params: {
  first_name: string;
  last_name: string;
  year: number | null;
  fraternity: string;
  school: string;
}): Promise<EnrichResult> {
  const yearPart = params.year ? ` around ${params.year}` : '';
  const prompt = `I'm researching professional information about ${params.first_name} ${params.last_name}, who graduated from ${params.school}${yearPart} and was a member of ${params.fraternity}.

Please search for their current:
1. Job title
2. Company/employer
3. City and state (US)

Return ONLY a JSON object — no markdown, no code blocks, no extra text:
{
  "current_title": "...",
  "company": "...",
  "location": "...",
  "confidence": "high|medium|low|not_found",
  "notes": "brief source or reason for confidence level"
}

If you cannot find this specific person or are uncertain it's the right person, set confidence to "not_found" and leave the other fields as empty strings.`;

  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PPLX_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [
        {
          role: 'system',
          content:
            'You are a professional researcher. Search the web and return ONLY valid JSON with no markdown, no code blocks, and no extra text.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 300,
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    throw new Error(`Perplexity API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const text: string = data.choices?.[0]?.message?.content?.trim() ?? '';

  // Strip markdown code fences if model wraps in them
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`No JSON in Perplexity response: ${text.slice(0, 100)}`);
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    title: (parsed.current_title as string) || '',
    company: (parsed.company as string) || '',
    location: (parsed.location as string) || '',
    confidence: (parsed.confidence as EnrichResult['confidence']) || 'low',
    notes: (parsed.notes as string) || '',
  };
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not connected' }, { status: 500 });
  }

  if (!PPLX_API_KEY) {
    return NextResponse.json(
      { error: 'PERPLEXITY_API_KEY is not configured. Add it to your .env.local and Vercel env vars.' },
      { status: 500 },
    );
  }

  let body: { chapter_id?: string; contact_ids?: string[]; limit?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { chapter_id, contact_ids, limit: reqLimit = 25 } = body;

  if (!chapter_id) {
    return NextResponse.json({ error: 'chapter_id is required' }, { status: 400 });
  }

  // ── Fetch chapter for context (school + fraternity) ──
  const { data: chapter, error: chapterErr } = await supabase
    .from('chapters')
    .select('chapter_name, school, fraternity')
    .eq('id', chapter_id)
    .single();

  if (chapterErr || !chapter) {
    return NextResponse.json({ error: 'Chapter not found' }, { status: 404 });
  }

  const fratContext = (chapter.fraternity as string) || (chapter.chapter_name as string) || 'Unknown Fraternity';
  const schoolContext = (chapter.school as string) || 'Unknown School';

  // ── Fetch contacts to process ──
  const batchLimit = Math.min(Number(reqLimit) || 25, 30);

  let contactQuery = supabase
    .from('alumni_contacts')
    .select('id, first_name, last_name, year')
    .eq('chapter_id', chapter_id);

  if (contact_ids && contact_ids.length > 0) {
    contactQuery = contactQuery.in('id', contact_ids.slice(0, batchLimit));
  } else {
    // Only fetch unenriched contacts
    contactQuery = contactQuery.is('pplx_enriched_at', null).limit(batchLimit);
  }

  const { data: contacts, error: contactsErr } = await contactQuery;

  if (contactsErr) {
    return NextResponse.json({ error: contactsErr.message }, { status: 500 });
  }

  if (!contacts || contacts.length === 0) {
    const { count: remaining } = await supabase
      .from('alumni_contacts')
      .select('id', { count: 'exact', head: true })
      .eq('chapter_id', chapter_id)
      .is('pplx_enriched_at', null);

    return NextResponse.json({
      data: {
        enriched: 0,
        not_found: 0,
        errors: 0,
        total_processed: 0,
        remaining: remaining ?? 0,
        all_done: (remaining ?? 0) === 0,
      },
    });
  }

  // ── Enrich each contact ──
  let enriched = 0;
  let not_found = 0;
  let errors = 0;

  for (const contact of contacts) {
    try {
      const result = await enrichPerson({
        first_name: contact.first_name as string,
        last_name: contact.last_name as string,
        year: contact.year as number | null,
        fraternity: fratContext,
        school: schoolContext,
      });

      await supabase
        .from('alumni_contacts')
        .update({
          pplx_title: result.title || null,
          pplx_company: result.company || null,
          pplx_location: result.location || null,
          pplx_confidence: result.confidence,
          pplx_notes: result.notes || null,
          pplx_enriched_at: new Date().toISOString(),
        })
        .eq('id', contact.id);

      if (result.confidence === 'not_found') {
        not_found++;
      } else {
        enriched++;
      }
    } catch (err) {
      console.error(`[alumni/enrich] Failed to enrich ${contact.first_name} ${contact.last_name}:`, err);
      errors++;
      // Mark as attempted so we don't hammer it again immediately
      await supabase
        .from('alumni_contacts')
        .update({ pplx_enriched_at: new Date().toISOString(), pplx_confidence: 'error' })
        .eq('id', contact.id);
    }

    await sleep(PPLX_DELAY_MS);
  }

  // ── Count remaining unenriched contacts ──
  const { count: remaining } = await supabase
    .from('alumni_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('chapter_id', chapter_id)
    .is('pplx_enriched_at', null);

  return NextResponse.json({
    data: {
      enriched,
      not_found,
      errors,
      total_processed: contacts.length,
      remaining: remaining ?? 0,
      all_done: (remaining ?? 0) === 0,
    },
  });
}
