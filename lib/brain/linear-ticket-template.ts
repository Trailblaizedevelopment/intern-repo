/**
 * Linear ticket body format aligned with
 * greekspeed/docs/users/LINEAR_TICKET_TEMPLATE.md
 * (Trailblaize agent-ready tickets).
 */

export const LINEAR_TICKET_DESCRIPTION_TEMPLATE = `**Description:** [1–3 sentences: what, why, constraints]

**Acceptance criteria:**
- [ ] [Acceptance criterion 1]
- [ ] [Acceptance criterion 2]
- [ ] [Acceptance criterion 3]

<!-- Optional fields below — include when useful -->
**Steps to reproduce:** [Numbered or bulleted list—for bugs or UX]
**Files relating:** [\`path/to/file.tsx\`, \`app/api/route.ts\`, ...]
**Screenshots:** [Note if user provided images; otherwise omit]`;

/** Prompt block for agents creating Linear issues via linear_save_issue. */
export function buildLinearTicketTemplateGuidance(): string {
  return [
    'LINEAR TICKET FORMAT (required — match greekspeed LINEAR_TICKET_TEMPLATE):',
    'Title: Verb + what + where (e.g. "Add End event button to event detail modal"). One deliverable per ticket.',
    'Description field MUST be markdown in this shape:',
    LINEAR_TICKET_DESCRIPTION_TEMPLATE,
    'Rules:',
    '- Invent title + description + acceptance criteria from the user request; do not paste their wording as a dump.',
    '- Acceptance criteria must be testable checklist items (- [ ] ...). Prefer 2–5 items.',
    '- Include Steps to reproduce for bugs/UX; Files relating when paths/components are known.',
    '- One ticket = one deliverable. Link blockers as "Blocked by TRA-123" when known.',
    '- Default product repo context (mention in description when ticket is for Greekspeed): Trailblaizedevelopment/greekspeed; Cursor branches from develop; PRs into develop only.',
    '- Flagship Tasks program: note branch/PR target feature/task-mvp when relevant.',
    '- For intern CRM / Dynamo / Nucleus tickets, name the correct repo (e.g. owentrailblaize/intern-repo) instead of greekspeed.',
    '- Do not assign Cursor or claim agent-ready unless AC is clear and there are no open questions.',
  ].join('\n');
}
