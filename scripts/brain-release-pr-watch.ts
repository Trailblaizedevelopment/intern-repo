/**
 * Local release PR watch preview — compose description for develop → main PR.
 *
 * Usage:
 *   npm run brain:release-pr              # dry run (compose only)
 *   npm run brain:release-pr -- --post    # update GitHub + Slack
 *   npm run brain:release-pr -- --pr 702  # target specific PR
 *   npm run brain:release-pr -- --force   # re-run even if already processed
 *
 * Requires .env.local with GITHUB_TOKEN (pull_requests: write), ANTHROPIC_API_KEY.
 * Slack (--post): SLACK_BOT_TOKEN + SLACK_BRAIN_CHANNEL_ID and/or webhook.
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

async function main(): Promise<void> {
  loadEnvLocal();

  const post = process.argv.includes('--post');
  const force = process.argv.includes('--force');
  const dryRun = !post;
  const prIdx = process.argv.indexOf('--pr');
  const prNumber = prIdx >= 0 ? parseInt(process.argv[prIdx + 1], 10) : undefined;

  const { runReleasePrWatch } = await import('../lib/brain/release-pr/run');

  console.log('Trailblaize Brain — Release PR Watch');
  console.log(`Mode: ${dryRun ? 'DRY RUN (GitHub + Slack disabled)' : 'UPDATE GITHUB + SLACK'}`);
  if (prNumber) console.log(`Target PR: #${prNumber}`);
  if (force) console.log('Force: yes');
  console.log('—'.repeat(60));

  const result = await runReleasePrWatch({
    dryRun,
    postToSlack: post,
    force,
    prNumber: Number.isFinite(prNumber) ? prNumber : undefined,
  });

  if (result.skipped) {
    console.log(`\nSkipped: ${result.reason}`);
    if (result.prNumber) console.log(`PR: #${result.prNumber}`);
    return;
  }

  console.log(`\nPR: #${result.prNumber} — ${result.prUrl}`);
  console.log('\n--- GITHUB DESCRIPTION ---\n');
  console.log(result.description || '(none)');
  console.log('\n--- END DESCRIPTION ---\n');

  if (post && result.slack) {
    console.log('Slack delivery:');
    console.log(`  ok:      ${result.slack.ok}`);
    console.log(`  targets: ${result.slack.targets.join(', ') || '(none)'}`);
    if (result.slack.error) console.log(`  error:   ${result.slack.error}`);
  } else {
    console.log('To update GitHub + Slack: npm run brain:release-pr -- --post');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
