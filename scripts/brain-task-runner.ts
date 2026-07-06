/**
 * Local brain task runner — runs one cron tick (poll Cursor or agent iteration).
 *
 * Usage:
 *   npm run brain:task-runner
 *   npm run brain:task-runner -- --loop   # keep ticking every 30s until no tasks
 */

import { readFileSync, existsSync } from 'fs';
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

async function tick(): Promise<boolean> {
  const { getSupabaseAdmin } = await import('../lib/supabase-admin');
  const { runOneTaskIteration } = await import('../lib/brain/tasks/runner');

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.error('Supabase not configured');
    process.exit(1);
  }

  const result = await runOneTaskIteration(supabase);
  console.log(JSON.stringify(result, null, 2));
  return result.processed;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const loop = process.argv.includes('--loop');
  const intervalMs = parseInt(process.env.BRAIN_TASK_TICK_MS || '30000', 10) || 30_000;

  console.log('Trailblaize Brain — Task Runner');
  console.log(`Mode: ${loop ? `loop (${intervalMs}ms)` : 'single tick'}\n`);

  if (!loop) {
    await tick();
    return;
  }

  for (;;) {
    const processed = await tick();
    if (!processed) {
      console.log('No runnable tasks — sleeping...');
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
