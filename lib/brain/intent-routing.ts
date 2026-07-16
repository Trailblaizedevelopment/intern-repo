/**
 * Conversation scopes for Brain chat — Lookup (default) and optional frozen Slice/Goal.
 * TRA-900: implement path is Linear Cursor delegate, not Slice/Goal.
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
    'Default to *Lookup*. Dynamo does not implement code and does not start Slice/Goal (frozen unless ops re-enable).',
    `State the chosen mode in your first line, e.g. *Mode: Lookup* (${modeLabel} bold).`,
    '',
    '1. *Lookup* (DEFAULT — nearly always)',
    '   Triggers: status questions, summaries, lists, "what is…", "show me…", "how many…", casual chat.',
    '   Ticket create: "create/file/open/build a ticket", "add to the roadmap" → optional 1–2 github_search_code/github_get_file rounds (feature asks), then linear_save_issue with vendored LINEAR_TICKET_TEMPLATE (Description + AC checklist + Files relating when known). Never assign Cursor. Short CS one-liners skip research.',
    '   Progress/status on a TRA (e.g. "progress on TRA-123", "what\'s going on with TRA-123") is handled by Slack Lookup status path — Linear state + comments + Cursor Cloud when resolvable. Do NOT call tasks_start_* or cursor_dispatch_agent.',
    '   Implement / fix / slice / handoff with a TRA-xxx id is handled outside the agent (Slack confirm → Linear Cursor delegate). Do NOT call tasks_start_* or cursor_dispatch_agent for that.',
    '   Behavior: Answer in this thread using tools. Do NOT call tasks_start_goal or tasks_start_slice.',
    '',
    '2. *Slice* / *Goal* — FROZEN (TRA-900)',
    '   Do NOT start Slice or Goal. If the user asks to "work on for an hour" or "slice", tell them to use a Linear ticket + implement phrasing so Dynamo can ask to assign Cursor on Linear.',
    '   Legacy tasks may still exist; you may answer status via tasks_list_active / tasks_get_status only.',
    '',
    'Ambiguous question → Lookup. Never invent implementation work Dynamo will do itself.',
  ].join('\n');
}
