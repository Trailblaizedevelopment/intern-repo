/**
 * Lead Finder API
 *
 * GET /api/lead-finder?state=TX&minRevenue=50000&orgTypes=alumni,fraternal
 *
 * Downloads and caches the IRS Exempt Organizations Business Master File (BMF)
 * for the given state, parses it, filters by org type and revenue, and returns
 * up to 2000 results sorted by revenue descending.
 */

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Extend Vercel function timeout to 60s (Pro) — IRS CSV downloads can be large
export const maxDuration = 60;

// ─── Types ────────────────────────────────────────────────────────────────────

interface BmfRow {
  EIN: string;
  NAME: string;
  ICO: string;
  STREET: string;
  CITY: string;
  STATE: string;
  ZIP: string;
  GROUP: string;
  SUBSECTION: string;
  AFFILIATION: string;
  CLASSIFICATION: string;
  RULING: string;
  DEDUCTIBILITY: string;
  FOUNDATION: string;
  ACTIVITY: string;
  ORGANIZATION: string;
  STATUS: string;
  TAX_PERIOD: string;
  ASSET_CD: string;
  INCOME_CD: string;
  FILING_REQ_CD: string;
  PF_FILING_REQ_CD: string;
  ACCT_PD: string;
  ASSET_AMT: string;
  INCOME_AMT: string;
  REVENUE_AMT: string;
  NTEE_CD: string;
  SORT_NAME: string;
  [key: string]: string;
}

interface LeadResult {
  ein: string;
  name: string;
  contact: string;
  city: string;
  state: string;
  zip: string;
  revenue: number;
  ntee: string;
  subsection: number;
  category: string;
  sort_name: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_RESULTS = 2000;

const GREEK_LETTERS = [
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta',
  'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho',
  'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
];

const FRATERNAL_KEYWORDS = [
  'mason', 'masons', 'masonic', 'lodge', 'knights of columbus', 'knights templar',
  'elks', 'moose', 'odd fellow', 'odd fellows', 'rebekah', 'shrine', 'shriners',
  'eagles', 'fraternal', 'fraternity', 'sorority', 'woodmen',
  'rotary', 'lions club', 'kiwanis', 'optimist club', 'jaycees', 'grange',
  'ancient free', 'scottish rite', 'york rite', 'eastern star',
];

const CATEGORY_LABELS: Record<string, string> = {
  alumni: 'Alumni Association',
  fraternal: 'Fraternal / Social Club',
  veterans: 'Veterans / Service Post',
  professional: 'Professional / Trade Association',
  club: 'Private / Country Club',
};

// Classification priority order (most specific first)
const CLASSIFY_ORDER = ['alumni', 'veterans', 'fraternal', 'club', 'professional'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countGreekLetters(name: string): number {
  const lower = name.toLowerCase();
  let count = 0;
  for (const letter of GREEK_LETTERS) {
    const re = new RegExp(`\\b${letter}\\b`, 'i');
    if (re.test(lower)) count++;
  }
  return count;
}

function isAlumni(name: string, ntee: string): boolean {
  return ntee.startsWith('B84') ||
    /\b(alumni|alumnae)\b/i.test(name);
}

function isVeterans(subsec: number): boolean {
  return subsec === 19 || subsec === 23;
}

function isFraternal(name: string, ntee: string, subsec: number): boolean {
  if (subsec === 8 || subsec === 10) return true;
  if (ntee.startsWith('Y40') || ntee.startsWith('Y41') || ntee.startsWith('Y42')) return true;
  const lower = name.toLowerCase();
  if (FRATERNAL_KEYWORDS.some(kw => lower.includes(kw))) return true;
  if (countGreekLetters(name) >= 2) return true;
  return false;
}

function isProfessional(subsec: number): boolean {
  return subsec === 6;
}

function isClub(name: string, ntee: string, subsec: number): boolean {
  if (subsec === 7) return true;
  if (ntee.startsWith('N50')) return true;
  return false;
}

function classify(
  name: string,
  ntee: string,
  subsec: number,
  selectedTypes: Set<string>,
): string | null {
  for (const type of CLASSIFY_ORDER) {
    if (!selectedTypes.has(type)) continue;
    switch (type) {
      case 'alumni':       if (isAlumni(name, ntee)) return type; break;
      case 'veterans':     if (isVeterans(subsec)) return type; break;
      case 'fraternal':    if (isFraternal(name, ntee, subsec)) return type; break;
      case 'professional': if (isProfessional(subsec)) return type; break;
      case 'club':         if (isClub(name, ntee, subsec)) return type; break;
    }
  }
  return null;
}

function cleanContact(ico: string | undefined): string {
  if (!ico) return '';
  // Strip leading %/C/O
  let name = ico.replace(/^[%\s]*(c\s*\/\s*o\s*)?/i, '').trim().replace(/^[,.\s]+|[,.\s]+$/g, '');
  if (!name || name.length < 3) return '';
  const lower = name.toLowerCase();
  const generic = ['treasurer', 'president', 'secretary', 'director', 'manager',
    'cpa', 'llc', 'llp', 'inc', 'p.c.', 'associates', 'accounting', 'tax service',
    'bookkeep', 'attn'];
  if (generic.some(g => lower.includes(g))) return '';
  const words = name.split(/\s+/);
  if (words.length < 2 || words.length > 4) return '';
  return name
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function titleCase(s: string): string {
  if (!s || !s.toUpperCase().includes(s.replace(/[^a-z]/gi, ''))) return s;
  const small = new Set(['of', 'the', 'and', 'for', 'at', 'in', 'on', 'a', 'an']);
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i === 0 || !small.has(w)) ? w.charAt(0).toUpperCase() + w.slice(1) : w)
    .join(' ');
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseCsv(text: string): BmfRow[] {
  const lines = text.split('\n');
  if (lines.length < 2) return [];

  // Parse headers from first line
  const headers = parseCsvLine(lines[0]).map(h => h.trim().toUpperCase());

  const rows: BmfRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const vals = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (vals[idx] ?? '').trim();
    });
    rows.push(row as BmfRow);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ─── BMF Download + Cache ─────────────────────────────────────────────────────

async function getBmfData(state: string): Promise<BmfRow[]> {
  const stateLower = state.toLowerCase();
  const cacheFile = path.join(os.tmpdir(), `irs-bmf-${stateLower}.csv`);

  // Check cache freshness
  try {
    const stat = await fs.stat(cacheFile);
    const age = Date.now() - stat.mtimeMs;
    if (age < CACHE_TTL_MS) {
      const cached = await fs.readFile(cacheFile, 'utf-8');
      return parseCsv(cached);
    }
  } catch {
    // Cache miss — download fresh
  }

  // Download from IRS
  const url = `https://www.irs.gov/pub/irs-soi/eo_${stateLower}.csv`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Trailblaize/1.0' },
    // 60 second timeout via AbortController
    signal: AbortSignal.timeout(55_000),
  });

  if (!response.ok) {
    throw new Error(`IRS BMF download failed: ${response.status} ${response.statusText} for ${url}`);
  }

  const text = await response.text();

  // Cache the result
  try {
    await fs.writeFile(cacheFile, text, 'utf-8');
  } catch (err) {
    console.warn('[lead-finder] Failed to cache BMF:', err);
  }

  return parseCsv(text);
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;

    const state = (searchParams.get('state') ?? '').trim().toUpperCase();
    if (!state || state.length !== 2 || !/^[A-Z]{2}$/.test(state)) {
      return NextResponse.json(
        { error: 'Please provide a valid 2-letter state abbreviation.' },
        { status: 400 },
      );
    }

    const minRevenue = Math.max(0, parseInt(searchParams.get('minRevenue') ?? '0', 10) || 0);

    const orgTypesParam = searchParams.get('orgTypes') ?? 'alumni,fraternal,veterans,professional,club';
    const validTypes = new Set(['alumni', 'fraternal', 'veterans', 'professional', 'club']);
    const selectedTypes = new Set(
      orgTypesParam.split(',')
        .map(t => t.trim().toLowerCase())
        .filter(t => validTypes.has(t)),
    );

    if (selectedTypes.size === 0) {
      return NextResponse.json(
        { error: 'Select at least one organization type.' },
        { status: 400 },
      );
    }

    // Load BMF data (cached or fresh from IRS)
    const rows = await getBmfData(state);

    const results: LeadResult[] = [];

    for (const row of rows) {
      // The IRS BMF already only contains currently exempt orgs — no status filter needed.
      const name = (row.NAME ?? '').trim();
      if (!name) continue;

      const ntee = (row.NTEE_CD ?? '').trim();
      const subsec = parseInt(row.SUBSECTION ?? '0', 10) || 0;
      const revenue = parseInt(row.REVENUE_AMT ?? '0', 10) || 0;

      // Revenue filter
      if (revenue < minRevenue) continue;

      const typeKey = classify(name, ntee, subsec, selectedTypes);
      if (!typeKey) continue;

      const ein = (row.EIN ?? '').trim();
      const contact = cleanContact(row.ICO);
      const sortName = (row.SORT_NAME ?? '').trim();

      results.push({
        ein,
        name: titleCase(name),
        contact,
        city: titleCase((row.CITY ?? '').trim()),
        state: (row.STATE ?? '').trim().toUpperCase(),
        zip: (row.ZIP ?? '').trim(),
        revenue,
        ntee,
        subsection: subsec,
        category: CATEGORY_LABELS[typeKey] ?? typeKey,
        sort_name: titleCase(sortName),
      });

      if (results.length >= MAX_RESULTS * 2) {
        // Pre-filter to avoid sorting too many; we'll truncate after sort
        break;
      }
    }

    // Sort by revenue descending
    results.sort((a, b) => b.revenue - a.revenue);

    return NextResponse.json(results.slice(0, MAX_RESULTS));
  } catch (err) {
    console.error('[lead-finder] error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
