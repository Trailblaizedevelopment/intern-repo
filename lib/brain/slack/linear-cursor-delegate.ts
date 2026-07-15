/**
 * TRA-900 Path A: ticket-backed implement → Slack confirm → Linear Cursor delegate.
 * No brain_tasks / Slice / Goal / cursor_dispatch_agent.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { BrainMessage } from '../agent';
import {
  delegateLinearIssueToCursor,
  fetchLinearIssueSummary,
} from '../linear-delegate';
import { extractLinearIssueId, isLinearTicketCreateIntent } from './orchestration-kickoff';
import { isStartWorkIntent } from './ticket-intent';
import { isTicketStatusIntent } from './ticket-status';

export const LINEAR_CURSOR_DELEGATE_KIND = 'linear_cursor_delegate' as const;

export interface PendingLinearCursorDelegate {
  kind: typeof LINEAR_CURSOR_DELEGATE_KIND;
  linear_issue_id: string;
  issue_title: string | null;
  issue_url: string | null;
  conversation_id: string | null;
  requested_at: string;
}

/** True when user wants Cursor to implement an existing Linear ticket. */
export function isTicketImplementIntent(message: string): boolean {
  const text = message.trim();
  if (!text || isLinearTicketCreateIntent(text)) return false;
  // Status Lookup wins only when there is no start/implement verb (see isTicketStatusIntent).
  if (isTicketStatusIntent(text)) return false;
  return isStartWorkIntent(text);
}

export function isPendingLinearCursorDelegate(
  value: unknown
): value is PendingLinearCursorDelegate {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { kind?: string }).kind === LINEAR_CURSOR_DELEGATE_KIND &&
    typeof (value as PendingLinearCursorDelegate).linear_issue_id === 'string'
  );
}

export function formatDelegateConfirmSlackMessage(pending: PendingLinearCursorDelegate): string {
  const title = pending.issue_title ? ` — ${pending.issue_title}` : '';
  const url = pending.issue_url ? `\n${pending.issue_url}` : '';
  return [
    '*Mode: Lookup*',
    '',
    `*Dispatch Cursor on \`${pending.linear_issue_id}\`?*${title}${url}`,
    '',
    'I will assign Cursor on Linear only (no Slice/Goal / Cloud Agent from Dynamo).',
    'Reply *yes dispatch* to assign, or *cancel* to skip.',
  ].join('\n');
}

export async function findPendingLinearCursorDelegate(
  supabase: SupabaseClient,
  channel: string,
  threadTs: string
): Promise<{ pending: PendingLinearCursorDelegate; conversationId: string } | null> {
  const convoTitle = `slack:${channel}:${threadTs}`;
  const { data: convo } = await supabase
    .from('brain_conversations')
    .select('id, pending_action')
    .eq('title', convoTitle)
    .maybeSingle();

  if (!convo?.id || !isPendingLinearCursorDelegate(convo.pending_action)) {
    return null;
  }

  return { pending: convo.pending_action, conversationId: convo.id };
}

async function clearPending(
  supabase: SupabaseClient,
  conversationId: string | null
): Promise<void> {
  if (!conversationId) return;
  await supabase
    .from('brain_conversations')
    .update({ pending_action: null, updated_at: new Date().toISOString() })
    .eq('id', conversationId);
}

/**
 * Start Path A: confirm ticket then ask for Cursor dispatch.
 * Returns null when the message should continue through Lookup / other handlers.
 */
export async function tryStartLinearCursorDelegateFlow(input: {
  message: string;
  history: BrainMessage[];
  supabase: SupabaseClient;
  conversationId: string | null;
  channel: string;
  threadTs: string;
  employeeId: string | null;
}): Promise<{ reply: string; conversationId: string | null; messages: BrainMessage[] } | null> {
  if (!isTicketImplementIntent(input.message)) return null;

  const linearId = extractLinearIssueId(input.message, input.history);
  if (!linearId) {
    const reply = [
      '*Mode: Lookup*',
      '',
      'To hand work to Cursor I need an existing Linear ticket id (e.g. `TRA-123`).',
      'Mention the TRA id, or create a ticket first. Open-ended create-then-dispatch is not enabled yet.',
    ].join('\n');
    return {
      reply,
      conversationId: input.conversationId,
      messages: [
        ...input.history,
        { role: 'user', content: input.message },
        { role: 'assistant', content: reply },
      ],
    };
  }

  const summary = await fetchLinearIssueSummary(linearId);
  const pending: PendingLinearCursorDelegate = {
    kind: LINEAR_CURSOR_DELEGATE_KIND,
    linear_issue_id: linearId,
    issue_title: summary?.title ?? null,
    issue_url: summary?.url ?? `https://linear.app/trailblaize/issue/${linearId}`,
    conversation_id: input.conversationId,
    requested_at: new Date().toISOString(),
  };

  let conversationId = input.conversationId;
  if (!conversationId) {
    const title = `slack:${input.channel}:${input.threadTs}`;
    const { data: created, error } = await input.supabase
      .from('brain_conversations')
      .insert([
        {
          employee_id: input.employeeId,
          title,
          messages: [],
          pending_action: pending,
        },
      ])
      .select('id')
      .single();
    if (error || !created) {
      const reply = `Could not save confirmation state: ${error?.message || 'unknown error'}`;
      return {
        reply,
        conversationId: input.conversationId,
        messages: [
          ...input.history,
          { role: 'user', content: input.message },
          { role: 'assistant', content: reply },
        ],
      };
    }
    conversationId = created.id;
    pending.conversation_id = conversationId;
  } else {
    await input.supabase
      .from('brain_conversations')
      .update({
        pending_action: pending,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);
  }

  const reply = formatDelegateConfirmSlackMessage(pending);
  return {
    reply,
    conversationId,
    messages: [
      ...input.history,
      { role: 'user', content: input.message },
      { role: 'assistant', content: reply },
    ],
  };
}

export async function executeApprovedLinearCursorDelegate(
  supabase: SupabaseClient,
  pending: PendingLinearCursorDelegate
): Promise<string> {
  const result = await delegateLinearIssueToCursor(pending.linear_issue_id, {
    required: true,
  });
  await clearPending(supabase, pending.conversation_id);

  if (!result.ok) {
    return [
      `*Failed to assign Cursor on \`${pending.linear_issue_id}\`*`,
      result.error || 'Unknown error',
      pending.issue_url ? pending.issue_url : null,
      '_Check `BRAIN_LINEAR_DELEGATE_CURSOR=true` and `LINEAR_CURSOR_DELEGATE_ID` (or Cursor Linear integration)._',
    ]
      .filter(Boolean)
      .join('\n');
  }

  const url = pending.issue_url || `https://linear.app/trailblaize/issue/${pending.linear_issue_id}`;
  return [
    `*Cursor owns \`${pending.linear_issue_id}\`*`,
    pending.issue_title ? pending.issue_title : null,
    url,
    '_Assigned via Linear Cursor delegate — Dynamo will not implement this itself._',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function denyPendingLinearCursorDelegate(
  supabase: SupabaseClient,
  pending: PendingLinearCursorDelegate
): Promise<string> {
  await clearPending(supabase, pending.conversation_id);
  return `Cancelled. \`${pending.linear_issue_id}\` was not assigned to Cursor.`;
}
