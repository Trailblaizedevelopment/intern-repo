/**
 * Plan-sharpening pass inspired by grill-me: produce a concrete execution plan
 * before starting a long-running brain_task.
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = process.env.BRAIN_MODEL || 'claude-sonnet-4-6';

export async function grillTaskPlan(goal: string, linearIssueId?: string | null): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return `Goal: ${goal}\n1. Research context in Linear/GitHub\n2. Dispatch Cursor cloud agent if code changes needed\n3. Verify outcome and summarize`;
  }

  const system = [
    'You sharpen engineering task plans. Be relentless but concise.',
    'Output a numbered plan (3-7 steps) with clear done criteria.',
    'No emojis. No fluff. Mention when to use Linear vs GitHub vs Cursor dispatch.',
    'If the goal is vague, state assumptions explicitly.',
  ].join('\n');

  const user = linearIssueId
    ? `Goal: ${goal}\nLinear issue: ${linearIssueId}`
    : `Goal: ${goal}`;

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
        max_tokens: 800,
        temperature: 0.3,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });

    if (!res.ok) return `Goal: ${goal}\n(Plan generation failed — proceed with research first.)`;

    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    return data.content?.find(c => c.type === 'text')?.text?.trim() || `Goal: ${goal}`;
  } catch {
    return `Goal: ${goal}\n(Plan generation failed — proceed with research first.)`;
  }
}
