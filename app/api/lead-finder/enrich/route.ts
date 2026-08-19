/**
 * Lead Finder — Enrich
 *
 * GET /api/lead-finder/enrich?ein=&name=&city=&state=
 *
 * Sources:
 *   1. ProPublica Nonprofit API — financial data (revenue, assets, address, filing year)
 *   2. Perplexity Search API    — website, phone, LinkedIn, email discovery
 */

import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 45;

interface EnrichedResult {
  website?: string;
  phone?: string;
  email?: string;
  linkedin?: string;
  description?: string;
  propublica_url?: string;
  address?: string;
  total_assets?: number;
  total_revenue?: number;
  filing_year?: number;
}

const PERPLEXITY_KEY = process.env.PERPLEXITY_API_KEY ?? '';

// ─── ProPublica ───────────────────────────────────────────────────────────────

async function fetchProPublica(ein: string): Promise<Partial<EnrichedResult>> {
  if (!ein) return {};
  try {
    const cleanEin = ein.replace(/\D/g, '');
    const res = await fetch(
      `https://projects.propublica.org/nonprofits/api/v2/organizations/${cleanEin}.json`,
      { headers: { 'User-Agent': 'Trailblaize/1.0' }, signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return {};
    const data = await res.json();
    const org = data?.organization ?? {};
    const filings: Record<string, unknown>[] = data?.filings_with_data ?? [];
    const latest = filings[0] ?? {};

    const address = [org.address, org.city, org.state, org.zipcode]
      .filter(Boolean).join(', ') || undefined;

    // Use filing totals when available (more accurate), fall back to org-level amounts
    const totalRevenue =
      typeof latest.totrevenue === 'number' ? latest.totrevenue :
      typeof org.revenue_amount === 'number' ? org.revenue_amount : undefined;

    const totalAssets =
      typeof latest.totassetsend === 'number' ? latest.totassetsend :
      typeof org.asset_amount === 'number' ? org.asset_amount : undefined;

    const filingYear =
      typeof latest.tax_prd_yr === 'number' ? latest.tax_prd_yr : undefined;

    return {
      address,
      total_revenue: totalRevenue,
      total_assets: totalAssets,
      filing_year: filingYear,
      propublica_url: cleanEin
        ? `https://projects.propublica.org/nonprofits/organizations/${cleanEin}`
        : undefined,
    };
  } catch {
    return {};
  }
}

// ─── Perplexity Search ────────────────────────────────────────────────────────

async function fetchPerplexity(
  name: string,
  city: string,
  state: string,
): Promise<Partial<EnrichedResult>> {
  try {
    const query = `Find the official website, phone number, email address, and LinkedIn page for "${name}" in ${city}, ${state}. Return ONLY a JSON object with these exact keys: website, phone, email, linkedin, description. Use null for any field you cannot find with confidence. No explanation, just the JSON.`;

    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: 'You are a research assistant. Return only valid JSON, no markdown, no explanation.',
          },
          { role: 'user', content: query },
        ],
        max_tokens: 400,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) return {};
    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content ?? '';

    // Parse JSON from response — strip markdown fences if present
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    const parsed = JSON.parse(jsonMatch[0]);

    const clean = (v: unknown): string | undefined =>
      typeof v === 'string' && v && v !== 'null' ? v : undefined;

    return {
      website:     clean(parsed.website),
      phone:       clean(parsed.phone),
      email:       clean(parsed.email),
      linkedin:    clean(parsed.linkedin),
      description: clean(parsed.description),
    };
  } catch {
    return {};
  }
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const ein   = (searchParams.get('ein')   ?? '').trim();
    const name  = (searchParams.get('name')  ?? '').trim();
    const city  = (searchParams.get('city')  ?? '').trim();
    const state = (searchParams.get('state') ?? '').trim();

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    // Run both sources in parallel
    const [pp, perplexity] = await Promise.all([
      fetchProPublica(ein),
      fetchPerplexity(name, city, state),
    ]);

    // Merge: Perplexity wins on contact fields, ProPublica wins on financials
    const merged: EnrichedResult = {
      website:       perplexity.website,
      phone:         perplexity.phone,
      email:         perplexity.email,
      linkedin:      perplexity.linkedin,
      description:   perplexity.description,
      address:       pp.address,
      total_revenue: pp.total_revenue,
      total_assets:  pp.total_assets,
      filing_year:   pp.filing_year,
      propublica_url: pp.propublica_url,
    };

    return NextResponse.json(merged);
  } catch (err) {
    console.error('[lead-finder/enrich] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Enrichment failed' },
      { status: 500 },
    );
  }
}
