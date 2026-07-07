import { postBriefingToSlack } from '../briefing/slack';
import { ReleasePrSnapshot } from './types';

export interface ReleasePrSlackResult {
  attempted: boolean;
  ok: boolean;
  targets: string[];
  error?: string;
}

function slackSummary(snapshot: ReleasePrSnapshot): string {
  const areas = [
    ...new Set(snapshot.commits.filter(c => c.area).map(c => c.area as string)),
  ].slice(0, 4);
  const tickets = snapshot.ticketIds.slice(0, 5);
  const parts: string[] = [];

  parts.push(`${snapshot.commitCount} commit${snapshot.commitCount === 1 ? '' : 's'}`);
  if (tickets.length > 0) parts.push(tickets.join(', '));
  if (areas.length > 0) parts.push(areas.join(' · '));

  return parts.join(' · ');
}

function extractReleaseSummary(description: string): string {
  const lines = description.split('\n');
  const startIdx = lines.findIndex(line => /^##\s*Release summary/i.test(line.trim()));
  if (startIdx < 0) {
    return lines.filter(line => line.trim() && !line.startsWith('<!--')).slice(0, 4).join('\n');
  }

  const summaryLines: string[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (i > startIdx && /^##\s+/.test(line.trim())) break;
    if (line.startsWith('<!--')) continue;
    summaryLines.push(line);
  }

  return summaryLines.join('\n').trim();
}

/** Notify Slack that a release PR description was auto-generated. */
export async function postReleasePrToSlack(
  snapshot: ReleasePrSnapshot,
  descriptionPreview: string
): Promise<ReleasePrSlackResult> {
  const summary = slackSummary(snapshot);
  const releaseSummary = extractReleaseSummary(descriptionPreview);

  const text = [
    `*Release PR ready for review* — <${snapshot.pr.url}|${snapshot.pr.title} #${snapshot.pr.number}>`,
    `develop → main · ${summary}`,
    '',
    releaseSummary,
  ].join('\n');

  return postBriefingToSlack(text);
}
