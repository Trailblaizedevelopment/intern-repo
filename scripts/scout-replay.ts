/**
 * Dry-run Scout planner replay.
 *
 * Usage:
 *   npx tsx scripts/scout-replay.ts --fixture scripts/fixtures/scout/01-decline-person.json
 *   npx tsx scripts/scout-replay.ts --all
 *
 * Requires .env.local (Supabase + a scout_profiles row). Does not send via Linq.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve } from 'path';

function loadEnvLocal(): void {
  const path = resolve(process.cwd(), '.env.local');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

interface FixtureExpect {
  tools?: string[];
  notTools?: string[];
  validationOk?: boolean;
  sent?: boolean;
  sentContains?: string;
  noNames?: string[];
  historyCount?: number;
  searchOmitsName?: string;
  searchOmitsGeo?: string;
  validationReasonsInclude?: string[];
  skipIf?: string;
}

interface Fixture {
  id: string;
  generateType?: 'open' | 'reply' | 'followup';
  profileId?: string;
  history?: Array<{ direction: 'inbound' | 'outbound'; message_body: string; created_at: string }>;
  synthesizeHistory?: number;
  scriptedToolCalls?: Array<{ name: string; input: Record<string, unknown> }>;
  seedRejections?: Array<{ type: 'person' | 'criterion' | 'action'; value: string; platform_profile_id?: string }>;
  seedIntents?: Array<{
    id: string;
    description: string;
    location: string | null;
    industry: string | null;
    status: string;
    expires_at: string | null;
    last_confirmed_at: string | null;
    effective_status: string;
  }>;
  expect: FixtureExpect;
}

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || !process.argv[idx + 1]) return null;
  return process.argv[idx + 1];
}

function synthesizeHistory(n: number): Fixture['history'] {
  const out: NonNullable<Fixture['history']> = [];
  const start = Date.parse('2026-07-01T00:00:00Z');
  for (let i = 0; i < n; i++) {
    out.push({
      direction: i % 2 === 0 ? 'outbound' : 'inbound',
      message_body: i === 0 ? 'OLDEST_MESSAGE_SHOULD_DROP' : `msg ${i}`,
      created_at: new Date(start + i * 60_000).toISOString(),
    });
  }
  return out;
}

function fail(id: string, msg: string): never {
  throw new Error(`[${id}] ${msg}`);
}

async function resolveProfileId(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  if (process.env.SCOUT_REPLAY_PROFILE_ID) return process.env.SCOUT_REPLAY_PROFILE_ID;
  const { getSupabaseAdmin } = await import('../lib/supabase-admin');
  const supabase = getSupabaseAdmin();
  if (!supabase) fail('setup', 'Database not configured');
  const { data } = await supabase
    .from('scout_profiles')
    .select('id')
    .eq('phone_number', '+16018263085')
    .maybeSingle();
  if (data?.id) return data.id as string;
  const { data: anyRow } = await supabase.from('scout_profiles').select('id').limit(1).maybeSingle();
  if (!anyRow?.id) fail('setup', 'No scout_profiles row found');
  return anyRow.id as string;
}

function searchResultFromTools(toolResults: unknown[]): Record<string, unknown> | null {
  for (const row of toolResults) {
    if (!row || typeof row !== 'object') continue;
    const r = row as { name?: string; result?: { hits?: unknown[] } };
    if (r.name === 'search_network' && r.result) return r.result as Record<string, unknown>;
  }
  return null;
}

async function runFixture(path: string, profileId: string): Promise<void> {
  const fixture = JSON.parse(readFileSync(path, 'utf8')) as Fixture;
  const { generateScoutMessage } = await import('../lib/scout/generate');

  const history =
    fixture.synthesizeHistory && fixture.synthesizeHistory > 0
      ? synthesizeHistory(fixture.synthesizeHistory)
      : fixture.history || [];

  const result = await generateScoutMessage(profileId, fixture.generateType || 'reply', {
    dryRun: true,
    historyOverride: history,
    scriptedToolCalls: fixture.scriptedToolCalls,
    seedRejections: fixture.seedRejections,
    seedIntents: fixture.seedIntents,
    recencyHours: 0,
  });

  const names = (result.toolCalls || []).map(t => t.name);
  const exp = fixture.expect;

  if (exp.tools) {
    for (const t of exp.tools) {
      if (!names.includes(t)) fail(fixture.id, `expected tool ${t}, got ${names.join(',') || '(none)'}`);
    }
  }
  if (exp.notTools) {
    for (const t of exp.notTools) {
      if (names.includes(t)) fail(fixture.id, `did not expect tool ${t}`);
    }
  }
  if (exp.validationOk === true && result.validation && !result.validation.ok) {
    fail(fixture.id, `expected validation ok, got ${result.validation.reasons.join(',')}`);
  }
  if (exp.validationOk === false && result.validation?.ok) {
    fail(fixture.id, 'expected validation to fail');
  }
  if (exp.validationReasonsInclude) {
    const reasons = result.validation?.reasons || [];
    for (const r of exp.validationReasonsInclude) {
      if (!reasons.some(x => x.includes(r))) {
        fail(fixture.id, `expected validation reason containing ${r}, got ${reasons.join(',')}`);
      }
    }
  }
  if (exp.sent === true && !result.message) fail(fixture.id, `expected sent text, reason=${result.reason}`);
  if (exp.sent === false && result.message) fail(fixture.id, 'expected no send');
  if (exp.sentContains && !(result.message || '').includes(exp.sentContains)) {
    fail(fixture.id, `sent text missing "${exp.sentContains}"`);
  }
  if (exp.noNames) {
    const sent = result.message || '';
    for (const n of exp.noNames) {
      if (sent.toLowerCase().includes(n.toLowerCase())) {
        fail(fixture.id, `sent text should not name ${n}`);
      }
    }
  }
  if (exp.historyCount != null && result.historyCount !== exp.historyCount) {
    fail(fixture.id, `historyCount expected ${exp.historyCount}, got ${result.historyCount}`);
  }
  if (exp.searchOmitsName) {
    const search = searchResultFromTools(result.toolResults || []);
    const hits = (search?.hits as Array<{ name?: string }> | undefined) || [];
    const needle = exp.searchOmitsName.toLowerCase();
    if (hits.some(h => (h.name || '').toLowerCase().includes(needle))) {
      fail(fixture.id, `search still included ${exp.searchOmitsName}`);
    }
  }
  if (exp.searchOmitsGeo) {
    const search = searchResultFromTools(result.toolResults || []);
    const hits = (search?.hits as Array<{ location?: string; hometown?: string }> | undefined) || [];
    const needle = exp.searchOmitsGeo.toLowerCase();
    if (
      hits.some(h =>
        `${h.location || ''} ${h.hometown || ''}`.toLowerCase().includes(needle)
      )
    ) {
      fail(fixture.id, `search still included geo ${exp.searchOmitsGeo}`);
    }
  }

  console.log(`PASS ${fixture.id}`);
}

async function main(): Promise<void> {
  loadEnvLocal();
  const fixtureDir = resolve(process.cwd(), 'scripts/fixtures/scout');
  const single = argValue('--fixture');
  const files = single
    ? [resolve(process.cwd(), single)]
    : readdirSync(fixtureDir)
        .filter(f => f.endsWith('.json'))
        .sort()
        .map(f => resolve(fixtureDir, f));

  if (files.length === 0) {
    console.error('No fixtures found');
    process.exit(1);
  }

  const profileId = await resolveProfileId(argValue('--profile-id') || undefined);
  console.log(`Replay profile ${profileId}`);
  console.log(`Fixtures: ${files.length}`);

  let failed = 0;
  for (const file of files) {
    try {
      await runFixture(file, profileId);
    } catch (err) {
      failed++;
      console.error(err instanceof Error ? err.message : err);
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} fixture(s) failed`);
    process.exit(1);
  }
  console.log(`\n${files.length} fixture(s) passed`);
}

void main();
