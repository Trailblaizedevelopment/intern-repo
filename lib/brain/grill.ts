/**
 * Plan-sharpening pass inspired by grill-me: produce a concrete execution plan
 * before starting a long-running brain_task.
 */

import type { BrainTaskKind } from './tasks/types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = process.env.BRAIN_MODEL || 'claude-sonnet-4-6';

export async function grillTaskPlan(
  goal: string,
  linearIssueId?: string | null,
  kind: BrainTaskKind = 'goal'
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const fallbackSlice = `Slice: ${goal}\n1. Confirm scope in Linear/GitHub\n2. One Cursor dispatch — single PR\n3. Verify PR and summarize`;
  const fallbackGoal = `Goal: ${goal}\n1. Research context in Linear/GitHub\n2. Dispatch Cursor cloud agent if code changes needed\n3. Verify outcome and summarize`;

  if (!apiKey) {
    return kind === 'slice' ? fallbackSlice : fallbackGoal;
  }

  const system =
    kind === 'slice'
      ? [
          'You sharpen *focused slice* plans for a single small PR.',
          'Output exactly 2-3 numbered steps with clear done criteria.',
          'One Cursor dispatch only — no follow-up slices. No emojis. No fluff.',
          'Mention Linear/GitHub research only if needed before Cursor.',
        ].join('\n')
      : [
          'You sharpen engineering task plans. Be relentless but concise.',
          'Output a numbered plan (3-7 steps) with clear done criteria.',
          'No emojis. No fluff. Mention when to use Linear vs GitHub vs Cursor dispatch.',
          'If the goal is vague, state assumptions explicitly.',
        ].join('\n');

  const user = linearIssueId
    ? `Goal: ${goal}\nLinear issue: ${linearIssueId}\nKind: ${kind}`
    : `Goal: ${goal}\nKind: ${kind}`;

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
        max_tokens: kind === 'slice' ? 400 : 800,
        temperature: 0.3,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });

    if (!res.ok) {
      return kind === 'slice' ? fallbackSlice : `${goal}\n(Plan generation failed — proceed with research first.)`;
    }

    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    return data.content?.find(c => c.type === 'text')?.text?.trim() || (kind === 'slice' ? fallbackSlice : goal);
  } catch {
    return kind === 'slice' ? fallbackSlice : `${goal}\n(Plan generation failed — proceed with research first.)`;
  }
}
