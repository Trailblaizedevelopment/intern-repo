import { BriefingSnapshot } from './types';
import { snapshotForPrompt } from './linear-snapshot';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = process.env.BRAIN_MODEL || 'claude-sonnet-4-6';

function templateBriefing(snapshot: BriefingSnapshot): string {
  const lines: string[] = [
    `*Morning Briefing — ${snapshot.briefingDateLabel}*`,
    `_Trailblaize Brain · ${snapshot.teamKey || 'all teams'}_`,
    '',
  ];

  lines.push('*✅ Completed yesterday*');
  if (snapshot.completedYesterday.length === 0) {
    lines.push('_No issues marked completed yesterday._');
  } else {
    for (const i of snapshot.completedYesterday.slice(0, 12)) {
      lines.push(`• <${i.url}|${i.identifier}> ${i.title}${i.assigneeName ? ` — _${i.assigneeName}_` : ''}`);
    }
    if (snapshot.completedYesterday.length > 12) {
      lines.push(`_…and ${snapshot.completedYesterday.length - 12} more_`);
    }
  }

  lines.push('', '*🎯 Due today*');
  if (snapshot.dueToday.length === 0) {
    lines.push('_Nothing due today._');
  } else {
    for (const i of snapshot.dueToday.slice(0, 10)) {
      lines.push(
        `• <${i.url}|${i.identifier}> ${i.title} _(${i.stateName}${i.assigneeName ? ` · ${i.assigneeName}` : ''})_`
      );
    }
  }

  if (snapshot.overdue.length > 0) {
    lines.push('', `*⚠️ Overdue (${snapshot.overdue.length})*`);
    for (const i of snapshot.overdue.slice(0, 8)) {
      lines.push(`• <${i.url}|${i.identifier}> ${i.title} _due ${i.dueDate}_`);
    }
  }

  const stateSummary = Object.entries(snapshot.countsByState)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name}: ${count}`)
    .join(' · ');
  lines.push('', '*📋 Active board*', stateSummary || '_No active issues_');

  const focus = snapshot.focusAssigneeEmail;
  const mine = snapshot.active.filter(a => a.assigneeEmail?.toLowerCase() === focus);
  if (mine.length > 0) {
    lines.push('', `*👤 Your focus (${mine.length} active)*`);
    for (const i of mine.slice(0, 8)) {
      lines.push(`• <${i.url}|${i.identifier}> ${i.title} _${i.stateName}_`);
    }
  }

  return lines.join('\n');
}

/** Generate Slack mrkdwn briefing via Anthropic, with deterministic fallback. */
export async function composeMorningBriefing(snapshot: BriefingSnapshot): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return templateBriefing(snapshot);

  const payload = snapshotForPrompt(snapshot);
  const system = [
    'You write concise morning engineering briefings for Slack (mrkdwn).',
    'Use Slack link syntax: <url|TRA-123> for issues when URLs are available in the source data.',
    'Structure with bold section headers using *asterisks*.',
    'Sections: Completed Yesterday, Focus Today (due + assignee priorities), Overdue if any, Board Snapshot.',
    'Be direct — bullet lists, no fluff. Max ~3500 characters.',
    'Do not use markdown tables — Slack mrkdwn does not render them. Use bullets only.',
    'Never invent ticket IDs. Only use identifiers from the JSON payload.',
    `Primary focus assignee: ${snapshot.focusAssigneeEmail}`,
  ].join('\n');

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
        system,
        messages: [
          {
            role: 'user',
            content: `Write today's morning briefing from this Linear snapshot:\n\n${JSON.stringify(payload, null, 2)}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      console.error('[brain/briefing] Anthropic compose failed:', res.status, await res.text());
      return templateBriefing(snapshot);
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = data.content?.find(c => c.type === 'text')?.text?.trim();
    return text || templateBriefing(snapshot);
  } catch (err) {
    console.error('[brain/briefing] compose error:', err);
    return templateBriefing(snapshot);
  }
}
