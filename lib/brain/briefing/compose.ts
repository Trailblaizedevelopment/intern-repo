import { BriefingSnapshot } from './types';
import { snapshotForPrompt } from './linear-snapshot';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = process.env.BRAIN_MODEL || 'claude-sonnet-4-6';

function briefingTitle(snapshot: BriefingSnapshot): string {
  return `*TRA Engineering Briefing — ${snapshot.briefingDateLabel}*`;
}

/** Strip emoji / decorative symbols from LLM output. */
function stripEmojis(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/\uFE0F/gu, '')
    .replace(/[ \t]+\n/g, '\n');
}

function normalizeBriefing(text: string, snapshot: BriefingSnapshot): string {
  let out = stripEmojis(text);
  out = out.replace(/^[─\-_=]{3,}\s*$/gm, '');
  out = out.replace(/\n{3,}/g, '\n\n').trim();

  const title = briefingTitle(snapshot);
  const lines = out.split('\n');
  const titleIdx = lines.findIndex(l => /TRA Engineering Briefing/i.test(l));
  if (titleIdx >= 0) {
    lines[titleIdx] = title;
    out = lines.join('\n');
  } else {
    out = `${title}\n\n${out}`;
  }

  return out.trim();
}

function issueLine(issue: { url: string; identifier: string; title: string }, suffix = ''): string {
  return `• <${issue.url}|${issue.identifier}> ${issue.title}${suffix}`;
}

function templateBriefing(snapshot: BriefingSnapshot): string {
  const lines: string[] = [briefingTitle(snapshot), ''];

  lines.push('*Completed Yesterday*');
  if (snapshot.completedYesterday.length === 0) {
    lines.push('No issues marked completed yesterday.');
  } else {
    for (const i of snapshot.completedYesterday.slice(0, 12)) {
      lines.push(issueLine(i, i.assigneeName ? ` — ${i.assigneeName}` : ''));
    }
    if (snapshot.completedYesterday.length > 12) {
      lines.push(`(${snapshot.completedYesterday.length - 12} more not shown)`);
    }
  }

  const focus = snapshot.focusAssigneeEmail;
  lines.push('', '*Focus Today*');

  if (snapshot.dueToday.length > 0) {
    lines.push('_Due today_');
    for (const i of snapshot.dueToday.slice(0, 10)) {
      lines.push(
        issueLine(i, ` — ${i.stateName}${i.priorityLabel ? ` · ${i.priorityLabel}` : ''}`)
      );
    }
  } else {
    lines.push('Nothing due today.');
  }

  const mine = snapshot.active.filter(a => a.assigneeEmail?.toLowerCase() === focus);
  const inProgress = mine.filter(i => i.stateType === 'started' && !snapshot.dueToday.some(d => d.identifier === i.identifier));
  if (inProgress.length > 0) {
    lines.push('', '_In progress (assignee)_');
    for (const i of inProgress.slice(0, 8)) {
      const due = i.dueDate ? ` · due ${i.dueDate}` : '';
      lines.push(issueLine(i, ` — ${i.stateName}${due}`));
    }
  }

  if (snapshot.overdue.length > 0) {
    lines.push('', '*Overdue*');
    for (const i of snapshot.overdue.slice(0, 8)) {
      lines.push(issueLine(i, ` — ${i.stateName} · due ${i.dueDate}`));
    }
  }

  const stateSummary = Object.entries(snapshot.countsByState)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name}: ${count}`)
    .join(' · ');
  lines.push(
    '',
    '*Board Snapshot*',
    `Active: ${snapshot.active.length} · Due today: ${snapshot.dueToday.length} · Overdue: ${snapshot.overdue.length} · Completed yesterday: ${snapshot.completedYesterday.length}`,
    stateSummary
  );

  return lines.join('\n');
}

function buildSystemPrompt(snapshot: BriefingSnapshot): string {
  const title = briefingTitle(snapshot);
  return [
    'You write factual morning engineering briefings for Slack (mrkdwn).',
    `First line MUST be exactly: ${title}`,
    '',
    'Section headers (bold with asterisks):',
    '*Completed Yesterday*',
    '*Focus Today*',
    '*Overdue* (only if overdue issues exist)',
    '*Board Snapshot*',
    '',
    'Rules:',
    '- NO emojis, NO unicode symbols, NO decorative lines (no ─── separators).',
    '- NO motivational or editorial language (no "move the needle", "ship these", "fresh week", "needs a triage decision").',
    '- State facts only. One bullet per issue.',
    '- Use Slack links: <url|TRA-123> Title — State · Priority',
    '- Focus Today: due today first, then assignee in-progress items for the focus user.',
    '- Board Snapshot: counts only, one or two lines.',
    '- No markdown tables. Max ~3000 characters.',
    '- Never invent ticket IDs.',
    `Focus assignee email: ${snapshot.focusAssigneeEmail}`,
  ].join('\n');
}

/** Generate Slack mrkdwn briefing via Anthropic, with deterministic fallback. */
export async function composeMorningBriefing(snapshot: BriefingSnapshot): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return templateBriefing(snapshot);

  const payload = snapshotForPrompt(snapshot);

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
        system: buildSystemPrompt(snapshot),
        messages: [
          {
            role: 'user',
            content: `Write today's briefing from this Linear snapshot JSON:\n\n${JSON.stringify(payload, null, 2)}`,
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
    if (!text) return templateBriefing(snapshot);
    return normalizeBriefing(text, snapshot);
  } catch (err) {
    console.error('[brain/briefing] compose error:', err);
    return templateBriefing(snapshot);
  }
}
