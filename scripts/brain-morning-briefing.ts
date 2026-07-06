/**
 * Local morning briefing preview — prints the exact Slack message body.
 *
 * Usage:
 *   npm run brain:briefing              # compose only (dry run)
 *   npm run brain:briefing -- --post    # compose + post to Slack
 *
 * Requires .env.local with LINEAR_API_KEY and ANTHROPIC_API_KEY.
 * Slack (--post): SLACK_BOT_TOKEN + SLACK_BRAIN_CHANNEL_ID and/or SLACK_BRAIN_DM_USER_ID
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
  const dryRun = !post;

  const { runMorningBriefing } = await import('../lib/brain/briefing/run');

  console.log('Trailblaize Brain — Morning Briefing Preview');
  console.log(`Mode: ${dryRun ? 'DRY RUN (Slack disabled)' : 'POST TO SLACK'}`);
  console.log('—'.repeat(60));

  const result = await runMorningBriefing({ dryRun, postToSlack: post });

  console.log('\n--- SLACK MESSAGE (exact body) ---\n');
  console.log(result.message);
  console.log('\n--- END MESSAGE ---\n');

  console.log('Snapshot:');
  console.log(`  Active:              ${result.snapshot.active.length}`);
  console.log(`  Completed yesterday: ${result.snapshot.completedYesterday.length}`);
  console.log(`  Due today:           ${result.snapshot.dueToday.length}`);
  console.log(`  Overdue:             ${result.snapshot.overdue.length}`);
  console.log(`  States:              ${JSON.stringify(result.snapshot.countsByState)}`);

  if (post) {
    console.log('\nSlack delivery:');
    console.log(`  ok:      ${result.slack.ok}`);
    console.log(`  targets: ${result.slack.targets.join(', ') || '(none)'}`);
    if (result.slack.error) console.log(`  error:   ${result.slack.error}`);
  } else {
    console.log('\nTo post to Slack: npm run brain:briefing -- --post');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
