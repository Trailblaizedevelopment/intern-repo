/**
 * Lead Finder — Enrich
 *
 * GET /api/lead-finder/enrich?ein=&name=&city=&state=
 *
 * Pulls enriched data for a single org from:
 *   1. ProPublica Nonprofit API (free) — website, phone, address from 990 filings
 *   2. Apollo.io Organizations Enrich — website, LinkedIn, description, employee count
 *
 * Returns the best available data from both sources combined.
 */

import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

interface EnrichedResult {
  website?: string;
  phone?: string;
  linkedin?: string;
  description?: string;
  employees?: string;
  founded?: string;
  propublica_url?: string;
  address?: string;
  total_assets?: number;
  total_revenue?: number;
  tax_period?: string;
  filing_year?: string;
}

const APOLLO_KEY = 'zDFZ2lpMJIyFZGrrtp9G7Q';

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

    return {
      website: (org.website as string | undefined) || undefined,
      phone: (org.phone as string | undefined) || undefined,
      address: [org.address, org.city, org.state, org.zipcode]
        .filter(Boolean).join(', ') || undefined,
      total_assets: typeof org.assets === 'number' ? org.assets : undefined,
      total_revenue: typeof org.income === 'number' ? org.income : undefined,
      tax_period: (org.tax_period as string | undefined) || undefined,
      filing_year: latest.tax_prd_yr as string | undefined,
      propublica_url: org.name
        ? `https://projects.propublica.org/nonprofits/organizations/${cleanEin}`
        : undefined,
    };
  } catch {
    return {};
  }
}

async function fetchApollo(
  name: string,
  city: string,
  state: string,
  website?: string,
): Promise<Partial<EnrichedResult>> {
  try {
    const body: Record<string, string> = { api_key: APOLLO_KEY, name };
    if (city)    body.organization_city  = city;
    if (state)   body.organization_state = state;
    if (website) body.domain             = website.replace(/^https?:\/\//, '').split('/')[0];

    const res = await fetch('https://api.apollo.io/v1/organizations/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) return {};
    const data = await res.json();
    const org = data?.organization ?? {};

    const rawSite = org.website_url as string | undefined;
    const cleanSite = rawSite
      ? rawSite.startsWith('http') ? rawSite : `https://${rawSite}`
      : undefined;

    return {
      website:     cleanSite,
      linkedin:    (org.linkedin_url as string | undefined) || undefined,
      description: (org.short_description as string | undefined) || undefined,
      employees:   org.estimated_num_employees
        ? String(org.estimated_num_employees)
        : undefined,
      founded:     (org.founded_year as string | undefined) || undefined,
      phone:       (org.sanitized_phone as string | undefined)
                     || (org.phone as string | undefined)
                     || undefined,
    };
  } catch {
    return {};
  }
}

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
    const [pp, apollo] = await Promise.all([
      fetchProPublica(ein),
      fetchApollo(name, city, state),
    ]);

    // If ProPublica found a website, re-run Apollo with the domain for better match
    let apolloWithSite: Partial<EnrichedResult> = {};
    if (!apollo.website && pp.website) {
      apolloWithSite = await fetchApollo(name, city, state, pp.website);
    }

    // Merge: Apollo > Apollo-with-site > ProPublica (first non-empty wins per field)
    const merged: EnrichedResult = {};
    const sources = [apollo, apolloWithSite, pp];
    const fields: (keyof EnrichedResult)[] = [
      'website', 'phone', 'linkedin', 'description', 'employees',
      'founded', 'propublica_url', 'address', 'total_assets',
      'total_revenue', 'tax_period', 'filing_year',
    ];
    for (const field of fields) {
      for (const src of sources) {
        if (src[field] !== undefined && src[field] !== null && src[field] !== '') {
          (merged as Record<string, unknown>)[field] = src[field];
          break;
        }
      }
    }

    return NextResponse.json(merged);
  } catch (err) {
    console.error('[lead-finder/enrich] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Enrichment failed' },
      { status: 500 },
    );
  }
}
