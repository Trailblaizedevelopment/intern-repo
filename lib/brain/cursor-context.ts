import { fetchTrailblaizeWebRules, getDevelopBranch, getGitHubRepoFull } from './github-repo';

export interface BuildCursorPromptInput {
  implementation: string;
  linearIssueId?: string | null;
  taskGoal?: string | null;
  integrationBranch: string;
}

function slugFromGoal(goal: string): string {
  return goal
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

/** Package Cursor dispatch prompt with Trailblaize-Web agent rules and branch conventions. */
export async function buildCursorDispatchPrompt(input: BuildCursorPromptInput): Promise<string> {
  const rules = await fetchTrailblaizeWebRules();
  const develop = getDevelopBranch();
  const repo = getGitHubRepoFull();
  const linear = input.linearIssueId?.trim() || null;
  const integration = input.integrationBranch;
  const branchHint = linear
    ? `cursor/${linear}-${slugFromGoal(input.taskGoal || input.implementation)}`
    : `cursor/${slugFromGoal(input.taskGoal || input.implementation)}`;

  return [
    '# Trailblaize Cursor Cloud Agent — implementation task',
    '',
    linear ? `Linear ticket: ${linear}` : null,
    input.taskGoal ? `Parent goal: ${input.taskGoal}` : null,
    '',
    '## Implementation instructions',
    input.implementation.trim(),
    '',
    '## Branch & PR rules (mandatory — non-negotiable)',
    `- Repository: ${repo}`,
    `- Integration branch (PR base): **${integration}**`,
    `- Work branch: **${branchHint}** (prefix cursor/, include Linear ID when available)`,
    `- Branch FROM: **${integration}** (not ${develop} directly for PR base)`,
    `- **NEVER open a PR targeting ${develop} or main** — humans merge ${integration} → ${develop} after review`,
    '- You implement code; Brain orchestrates. Follow acceptance criteria in the ticket.',
    '',
    '## AGENTS.md (orchestration charter)',
    rules.agentsExcerpt,
    '',
    '## OPENCLAW_GUARDRAILS.md',
    rules.guardrailsExcerpt,
    '',
    '## Linear ↔ Cursor workflow',
    rules.workflowExcerpt,
    '',
    '## Done criteria',
    `- Changes on a cursor/ branch, PR opened targeting **${integration}** only`,
    `- Do NOT merge the PR — a human will review and merge`,
    linear ? `- Reference ${linear} in PR title and commits` : null,
    '- Summarize what changed and how to verify',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}
