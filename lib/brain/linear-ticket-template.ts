/**
 * Linear ticket body format for Dynamo ticket-create.
 * Source of truth: lib/brain/knowledge/LINEAR_TICKET_TEMPLATE.md
 * (vendored from greekspeed docs/users/LINEAR_TICKET_TEMPLATE.md).
 */

import { readFileSync } from 'fs';
import { join } from 'path';

/** Safe default GitHub repo when the ask does not name one (TRA-908). */
export const DEFAULT_TICKET_CREATE_REPO = 'Trailblaizedevelopment/Trailblaize-Web';

export const KNOWN_TICKET_CREATE_REPOS = [
  'Trailblaizedevelopment/Trailblaize-Web',
  'Trailblaizedevelopment/greekspeed',
  'owentrailblaize/intern-repo',
] as const;

/** Fallback shape if the vendored MD cannot be read at runtime. */
export const LINEAR_TICKET_DESCRIPTION_TEMPLATE = `**Description:** [1–3 sentences: what, why, constraints]

**Acceptance criteria:**
- [ ] [Acceptance criterion 1]
- [ ] [Acceptance criterion 2]
- [ ] [Acceptance criterion 3]

<!-- Optional fields below — include when useful -->
**Steps to reproduce:** [Numbered or bulleted list—for bugs or UX]
**Files relating:** [\`path/to/file.tsx\`, \`app/api/route.ts\`, ...]
**Screenshots:** [Note if user provided images; otherwise omit]`;

let templateMdCache: string | null = null;
let templateSectionsCache: string | null = null;

/** Load the full vendored LINEAR_TICKET_TEMPLATE.md (cwd-relative, same as release-pr). */
export function loadLinearTicketTemplateMd(): string {
  if (templateMdCache) return templateMdCache;
  const path = join(process.cwd(), 'lib/brain/knowledge/LINEAR_TICKET_TEMPLATE.md');
  templateMdCache = readFileSync(path, 'utf8');
  return templateMdCache;
}

/**
 * Template + Example sections for agent systemAppend injection.
 * Falls back to the inline description skeleton if the MD is missing or unparseable.
 */
export function loadLinearTicketTemplatePromptSections(): string {
  if (templateSectionsCache) return templateSectionsCache;

  try {
    const md = loadLinearTicketTemplateMd();
    const templateStart = md.indexOf('## Template');
    const exampleStart = md.indexOf('## Example:');
    if (templateStart === -1) {
      templateSectionsCache = LINEAR_TICKET_DESCRIPTION_TEMPLATE;
      return templateSectionsCache;
    }

    let end = md.length;
    if (exampleStart !== -1) {
      const afterExampleHeading = md.slice(exampleStart);
      const openFence = afterExampleHeading.indexOf('```');
      if (openFence !== -1) {
        const closeFence = afterExampleHeading.indexOf('```', openFence + 3);
        if (closeFence !== -1) {
          end = exampleStart + closeFence + 3;
        }
      }
    } else {
      const afterTemplate = md.slice(templateStart + 3);
      const nextH2 = afterTemplate.search(/\n## /);
      if (nextH2 !== -1) end = templateStart + 3 + nextH2;
    }

    templateSectionsCache = md.slice(templateStart, end).trim();
  } catch {
    templateSectionsCache = LINEAR_TICKET_DESCRIPTION_TEMPLATE;
  }

  return templateSectionsCache;
}

/** Prompt block for agents creating Linear issues via linear_save_issue. */
export function buildLinearTicketTemplateGuidance(): string {
  const sections = loadLinearTicketTemplatePromptSections();
  return [
    'LINEAR TICKET FORMAT (required — match vendored LINEAR_TICKET_TEMPLATE.md):',
    'Title: Verb + what + where (e.g. "Add End event button to event detail modal"). One deliverable per ticket.',
    'Description field MUST be markdown matching the Template below (full body, not a one-line paraphrase):',
    '',
    sections,
    '',
    'Rules:',
    '- Invent title + description + acceptance criteria from the user request; never paste raw Slack text as a dump.',
    '- Always include **Description:** and testable **Acceptance criteria:** as `- [ ]` checklist items. Prefer 2–5 items.',
    '- Include **Files relating:** when paths/components are known (from GitHub research or the user). Omit or note unresolved if search failed.',
    '- Include Steps to reproduce for bugs/UX; Screenshots when the user provided images.',
    '- One ticket = one deliverable. Link blockers as "Blocked by TRA-123" when known.',
    `- Repo context: name the correct GitHub repo in the description. Known: ${KNOWN_TICKET_CREATE_REPOS.join(', ')}. Safe default when unclear: ${DEFAULT_TICKET_CREATE_REPO}.`,
    '- Flagship Tasks program: note branch/PR target feature/task-mvp when relevant.',
    '- Do not assign Cursor or claim agent-ready unless AC is clear and there are no open questions.',
  ].join('\n');
}
