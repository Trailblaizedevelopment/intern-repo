import { readFileSync } from 'fs';
import { join } from 'path';
import { commitsForPrompt, snapshotFromCommits } from './commits';
import { ReleasePrSnapshot } from './types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = process.env.BRAIN_MODEL || 'claude-sonnet-4-6';
const MERGE_TITLE_PATTERN = /^Merge pull request #\d+ from [^\s]+(?:\/[^\s]+)?\s*/i;

let templateCache: string | null = null;

export function loadReleasePrTemplate(): string {
  if (templateCache) return templateCache;
  const path = join(process.cwd(), 'lib/brain/release-pr/template.md');
  templateCache = readFileSync(path, 'utf8');
  return templateCache;
}

function groupByArea(snapshot: ReleasePrSnapshot): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  const { featureCommits } = snapshotFromCommits(snapshot.commits);

  for (const commit of featureCommits) {
    const area = commit.area || 'Other';
    const ticket = commit.ticketIds[0] ? `**${commit.ticketIds[0]}** — ` : '';
    const line = `- ${ticket}${commit.message}`;
    const existing = groups.get(area) || [];
    existing.push(line);
    groups.set(area, existing);
  }

  return groups;
}

function templateReleaseDescription(snapshot: ReleasePrSnapshot): string {
  const { ticketIds, includedPrNumbers, featureCommits } = snapshotFromCommits(snapshot.commits);
  const groups = groupByArea(snapshot);
  const lines: string[] = ['## Release summary'];

  if (featureCommits.length === 0) {
    lines.push('Production release from develop with no additional feature commits.');
  } else if (ticketIds.length > 0) {
    lines.push(
      `Ships ${featureCommits.length} commit${featureCommits.length === 1 ? '' : 's'} covering ${ticketIds.join(', ')}.`
    );
  } else {
    lines.push(
      `Ships ${featureCommits.length} commit${featureCommits.length === 1 ? '' : 's'} from develop to production.`
    );
  }

  lines.push('', '## Changes');
  if (groups.size === 0) {
    lines.push('- No feature commits detected beyond merge commits.');
  } else {
    for (const [area, bullets] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push('', `### ${area}`);
      lines.push(...bullets.slice(0, 8));
      if (bullets.length > 8) lines.push(`- (${bullets.length - 8} more)`);
    }
  }

  if (includedPrNumbers.length > 0) {
    lines.push('', '## Included PRs');
    for (const num of includedPrNumbers) {
      const merge = snapshot.commits.find(c => c.mergedPrNumber === num);
      const ticket = merge?.ticketIds[0] ? `${merge.ticketIds[0]} ` : '';
      const title = merge?.message.replace(MERGE_TITLE_PATTERN, '').trim() || `PR #${num}`;
      lines.push(`- #${num} — ${ticket}${title}`);
    }
  }

  lines.push(
    '',
    '## Test plan',
    '- [ ] Smoke test critical auth flows',
    '- [ ] Verify analytics events in staging',
    '- [ ] Spot-check UI changes on affected pages'
  );

  return lines.join('\n');
}

function buildSystemPrompt(template: string): string {
  return [
    'You write concise GitHub pull request descriptions for production releases (develop → main).',
    'Output GitHub-flavored Markdown only — no preamble, no code fences.',
    '',
    'Follow this structure exactly (fill in content, remove HTML comments):',
    template,
    '',
    'Rules:',
    '- Summarize merge commits as their parent feature; never list raw SHAs.',
    '- Group changes by area (Auth, Analytics, UI, etc.).',
    '- Use **TRA-XXX** when ticket IDs appear in commit messages.',
    '- Keep bullets short — one line each, plain English.',
    '- Do not invent ticket IDs or PR numbers not present in the input.',
    '- Test plan: 3-5 actionable checkboxes relevant to the changes.',
    '- Max ~2000 characters.',
  ].join('\n');
}

export async function composeReleasePrDescription(snapshot: ReleasePrSnapshot): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const template = loadReleasePrTemplate();
  if (!apiKey) return templateReleaseDescription(snapshot);

  const payload = {
    pr: {
      number: snapshot.pr.number,
      title: snapshot.pr.title,
      url: snapshot.pr.url,
      author: snapshot.pr.author,
      base: snapshot.pr.base,
      head: snapshot.pr.head,
    },
    commit_count: snapshot.commitCount,
    commits: commitsForPrompt(snapshot.commits),
    ticket_ids: snapshot.ticketIds,
    included_prs: snapshot.includedPrNumbers,
  };

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: 1200,
        temperature: 0.2,
        system: buildSystemPrompt(template),
        messages: [
          {
            role: 'user',
            content: `Write the release PR description from this snapshot JSON:\n\n${JSON.stringify(payload, null, 2)}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      console.error('[brain/release-pr] Anthropic compose failed:', res.status, await res.text());
      return templateReleaseDescription(snapshot);
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = data.content?.find(c => c.type === 'text')?.text?.trim();
    if (!text) return templateReleaseDescription(snapshot);
    return text.replace(/^```(?:markdown)?\s*/i, '').replace(/\s*```$/i, '').trim();
  } catch (err) {
    console.error('[brain/release-pr] compose error:', err);
    return templateReleaseDescription(snapshot);
  }
}
