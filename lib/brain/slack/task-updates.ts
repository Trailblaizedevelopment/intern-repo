import { ToolEvent } from '../agent';
import { BrainTaskRow } from '../tasks/types';

function shortToolName(name: string): string {
  return name.replace(/^(github_|linear_|tasks_|cursor_)/, '');
}

/** One-line Slack update after a task runner iteration. */
export function formatTaskIterationSlackUpdate(
  task: BrainTaskRow,
  iteration: number,
  toolEvents: ToolEvent[],
  reply: string
): string {
  if (task.status === 'awaiting_approval') {
    return '';
  }

  if (task.status === 'blocked') {
    return ['*Task blocked*', task.error || reply.slice(0, 200)].filter(Boolean).join('\n');
  }

  const okTools = toolEvents.filter(e => e.ok).map(e => shortToolName(e.name));
  const dispatchPending = toolEvents.some(
    e => e.name === 'cursor_dispatch_agent' && e.ok && (e.output as { status?: string })?.status === 'awaiting_approval'
  );

  const prFromTools = toolEvents
    .map(e => e.output)
    .filter((o): o is Record<string, unknown> => Boolean(o && typeof o === 'object'))
    .flatMap(o => {
      const lines: string[] = [];
      if (typeof o.url === 'string' && String(o.url).includes('/pull/')) {
        lines.push(`opened ${o.url}`);
      }
      if (typeof o.prUrl === 'string') lines.push(`PR: ${o.prUrl}`);
      if (typeof o.number === 'number' && typeof o.url === 'string') {
        lines.push(`PR #${o.number}`);
      }
      return lines;
    });

  const toolLine =
    okTools.length > 0
      ? okTools.slice(0, 5).join(', ')
      : dispatchPending
        ? 'awaiting dispatch approval'
        : 'agent step';

  const detail = prFromTools[0] || reply.split('\n')[0]?.slice(0, 160) || toolLine;

  return [
    `*Iteration ${iteration}:* ${detail}`,
    task.linear_issue_id ? `_${task.linear_issue_id}_` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatCursorPollSlackUpdate(
  task: BrainTaskRow,
  runStatus: string,
  branch?: string | null
): string {
  const branchPart = branch ? ` on \`${branch}\`` : '';
  return `*Cursor ${runStatus}*${branchPart}${task.linear_issue_id ? ` · ${task.linear_issue_id}` : ''}`;
}
