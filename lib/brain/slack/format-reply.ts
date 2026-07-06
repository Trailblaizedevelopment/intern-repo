import { ToolEvent } from '../agent';

function formatToolLabel(name: string): string {
  if (name.startsWith('github_')) return name.replace(/^github_/, '');
  if (name.startsWith('linear_')) return name.replace(/^linear_/, '');
  return name;
}

/** Format agent reply + tool summary for Slack mrkdwn. */
export function formatAgentReplyForSlack(reply: string, toolEvents: ToolEvent[]): string {
  const parts: string[] = [];

  if (toolEvents.length > 0) {
    const ok = toolEvents.filter(e => e.ok);
    const fail = toolEvents.filter(e => !e.ok);
    if (ok.length > 0) {
      const names = [...new Set(ok.map(t => formatToolLabel(t.name)))].slice(0, 6);
      parts.push(`_Tools: ${names.join(', ')}_`);
    }
    if (fail.length > 0) {
      parts.push(`_${fail.length} tool call(s) failed._`);
    }
  }

  const body = reply
    .replace(/\*\*/g, '*')
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
    .replace(/^- /gm, '• ');

  if (parts.length > 0) {
    return `${parts.join('\n')}\n\n${body}`;
  }
  return body;
}
