/**
 * Three conversation scopes for Brain chat — Lookup (default), Slice, Goal.
 * Used in the agent system prompt; task_kind on brain_tasks backs Slice vs Goal at runtime.
 */

export type BrainIntentMode = 'lookup' | 'slice' | 'goal';

export const SLICE_DEFAULT_MAX_MINUTES = parseInt(process.env.BRAIN_SLICE_MAX_MINUTES || '15', 10) || 15;
export const SLICE_DEFAULT_MAX_ITERATIONS = parseInt(process.env.BRAIN_SLICE_MAX_ITERATIONS || '4', 10) || 4;
export const GOAL_DEFAULT_MAX_MINUTES = parseInt(process.env.BRAIN_GOAL_MAX_MINUTES || '60', 10) || 60;

export function isSliceTaskKind(kind: string | null | undefined): boolean {
  return kind === 'slice';
}

/** System-prompt block for classifying user intent before acting. */
export function buildIntentRoutingPrompt(surface: 'workspace' | 'slack'): string {
  const modeLabel = surface === 'slack' ? 'Slack mrkdwn' : 'markdown';

  return [
    'INTENT ROUTING (required — classify every new user message before tools):',
    '',
    'Default to *Lookup* unless the user clearly asks for implementation or sustained background work.',
    `State the chosen mode in your first line, e.g. *Mode: Lookup* (${modeLabel} bold).`,
    '',
    '1. *Lookup* (DEFAULT)',
    '   Triggers: status questions, summaries, lists, "what is…", "show me…", "how many…", casual chat.',
    '   Behavior: Answer in this thread using tools. Do NOT call tasks_start_goal or tasks_start_slice.',
    '   If code change is mentioned casually, ask whether they want a *Slice* (one small PR) before starting work.',
    '',
    '2. *Slice* (focused implementation)',
    '   Triggers: "fix X", "implement", "small PR", "dispatch Cursor", single Linear ticket with clear scope.',
    '   Behavior: FIRST tool call MUST be tasks_start_slice — embed the full user request in goal. One Cursor dispatch max.',
    '   Do NOT call linear_*, github_*, or tickets_* before queueing. Research happens in the background runner, NOT in Slack chat.',
    '   If this thread already has Lookup answers, reuse them in the goal text — do not re-fetch.',
    '   Do NOT use tasks_start_goal for small fixes. If research-only (no code), stay in Lookup.',
    '',
    '3. *Goal* (extended background work)',
    '   Triggers: "work on for an hour", "keep iterating", multi-step epics, multiple PRs, vague large scope.',
    '   Behavior: FIRST tool call MUST be tasks_start_goal — embed the full user request in goal.',
    '   Do NOT research in Slack chat before queueing. Background runner handles iterations.',
    '   Confirm briefly if the scope sounds like a Slice instead (one PR).',
    '',
    'Ambiguous implementation request → prefer Slice over Goal. Ambiguous question → Lookup.',
    'Never start Goal or Slice for pure information requests.',
  ].join('\n');
}
