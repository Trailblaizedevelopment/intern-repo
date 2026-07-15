/**
 * Shared Slack intent signals for TRA ticket handoff vs status Lookup.
 * Keep implement/start preferred over status when both words appear.
 */

/** Start / handoff work to Cursor on an existing Linear ticket. */
export const START_WORK_SIGNALS =
  /\b(implement|fix|slice|dispatch\s+cursor|assign\s+(to\s+)?cursor|hand\s*off|handoff|work\s+on|do\s+the\s+work|ship\s+it|get\s+started|start\s+(work|on)|kick\s*off|begin)\b/i;

/** True when the user wants Dynamo to start / hand off work (Path A). */
export function isStartWorkIntent(message: string): boolean {
  return START_WORK_SIGNALS.test(message.trim());
}
