import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  BrainMessage,
  TICKET_CREATE_MAX_TOOL_ITERATIONS,
  compactBrainMessagesForStorage,
  prepareBrainMessagesForApi,
  runBrainAgent,
} from '../agent';
import {
  denyPendingCursorDispatch,
  executeApprovedCursorDispatch,
  findPendingDispatchForSlackThread,
  isCursorApprovalMessage,
  isCursorDenialMessage,
} from '../cursor-approval';
import {
  addConversationMemories,
  isMem0Configured,
  resolveMem0UserId,
  safeSearchMemories,
} from '../mem0/client';
import { mergeMemoryIntoSystemAppend } from '../mem0/prompt';
import { checkBrainRateLimit } from '../rate-limit';
import { sanitizeForActionLog } from '../sanitize-log';
import { pickSlackAckPhrase } from './ack-phrases';
import { postSlackMessage, postSlackMessageReturningTs, replaceSlackThreadReply } from './client';
import { formatAgentReplyForSlack } from './format-reply';
import {
  denyPendingLinearCursorDelegate,
  executeApprovedLinearCursorDelegate,
  findPendingLinearCursorDelegate,
  tryStartLinearCursorDelegateFlow,
} from './linear-cursor-delegate';
import {
  buildSlackOrchestrationAppend,
  isLinearTicketCreateIntent,
  tryOrchestrationKickoff,
} from './orchestration-kickoff';
import { handleTaskStopMessage, isTaskStopMessage } from './task-control';
import { tryTicketStatusLookup } from './ticket-status';

const MAX_STORED_MESSAGES = 40;

export interface SlackChatContext {
  channel: string;
  threadTs: string;
  userId: string;
}

function slackConversationTitle(channel: string, threadTs: string): string {
  return `slack:${channel}:${threadTs}`;
}

async function resolveEmployee(): Promise<{
  employeeId: string | null;
  employeeName: string | null;
  employeeEmail: string;
}> {
  const supabase = getSupabaseAdmin();
  const email = (process.env.BRAIN_BRIEFING_ASSIGNEE_EMAIL || 'devin@trailblaize.net').toLowerCase();

  if (!supabase) {
    return { employeeId: null, employeeName: null, employeeEmail: email };
  }

  const { data: employee } = await supabase
    .from('employees')
    .select('id, name, email')
    .eq('email', email)
    .maybeSingle();

  return {
    employeeId: employee?.id ?? null,
    employeeName: employee?.name ?? null,
    employeeEmail: (employee?.email as string | undefined)?.toLowerCase() || email,
  };
}

async function loadSlackConversation(
  title: string
): Promise<{ id: string; messages: BrainMessage[] } | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data } = await supabase
    .from('brain_conversations')
    .select('id, messages')
    .eq('title', title)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    messages: prepareBrainMessagesForApi((data.messages as BrainMessage[]) || []),
  };
}

async function saveSlackConversation(
  conversationId: string | null,
  title: string,
  employeeId: string | null,
  messages: BrainMessage[]
): Promise<string> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('Database not configured');

  const stored = compactBrainMessagesForStorage(messages).slice(-MAX_STORED_MESSAGES);

  if (conversationId) {
    await supabase
      .from('brain_conversations')
      .update({ messages: stored, updated_at: new Date().toISOString() })
      .eq('id', conversationId);
    return conversationId;
  }

  const { data: created, error } = await supabase
    .from('brain_conversations')
    .insert([{ employee_id: employeeId, title, messages: stored }])
    .select('id')
    .single();

  if (error || !created) {
    throw new Error(error?.message || 'Failed to create Slack conversation');
  }
  return created.id;
}

/** Run Brain agent for a Slack message and reply in-thread. */
export async function handleSlackChatMessage(text: string, ctx: SlackChatContext): Promise<void> {
  const message = text.trim();
  if (!message) return;

  const employee = await resolveEmployee();
  const rateLimit = checkBrainRateLimit(`slack:${ctx.userId}`);
  if (!rateLimit.ok) {
    await postSlackMessage(
      ctx.channel,
      `${rateLimit.reason}. Try again in ${rateLimit.retryAfterSec}s.`,
      ctx.threadTs
    );
    return;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    await postSlackMessage(ctx.channel, 'Database not configured.', ctx.threadTs);
    return;
  }

  const convoTitle = slackConversationTitle(ctx.channel, ctx.threadTs);
  const existing = await loadSlackConversation(convoTitle);
  let conversationId = existing?.id ?? null;

  const pendingLinearDelegate = await findPendingLinearCursorDelegate(
    supabase,
    ctx.channel,
    ctx.threadTs
  );

  if (pendingLinearDelegate && isCursorApprovalMessage(message)) {
    const placeholder = await postSlackMessageReturningTs(
      ctx.channel,
      pickSlackAckPhrase(),
      ctx.threadTs
    );
    const text = await executeApprovedLinearCursorDelegate(
      supabase,
      pendingLinearDelegate.pending,
      { channel: ctx.channel, threadTs: ctx.threadTs }
    );
    if (placeholder.ok && placeholder.ts) {
      await replaceSlackThreadReply(ctx.channel, placeholder.ts, ctx.threadTs, text);
    } else {
      await postSlackMessage(ctx.channel, text, ctx.threadTs);
    }
    return;
  }

  if (pendingLinearDelegate && isCursorDenialMessage(message)) {
    const text = await denyPendingLinearCursorDelegate(
      supabase,
      pendingLinearDelegate.pending
    );
    await postSlackMessage(ctx.channel, text, ctx.threadTs);
    return;
  }

  const pendingDispatch = await findPendingDispatchForSlackThread(
    supabase,
    ctx.channel,
    ctx.threadTs
  );

  if (pendingDispatch && isCursorApprovalMessage(message)) {
    const placeholder = await postSlackMessageReturningTs(
      ctx.channel,
      pickSlackAckPhrase(),
      ctx.threadTs
    );
    const result = await executeApprovedCursorDispatch(supabase, pendingDispatch.pending, {
      channel: ctx.channel,
      threadTs: ctx.threadTs,
    });
    if (placeholder.ok && placeholder.ts) {
      await replaceSlackThreadReply(ctx.channel, placeholder.ts, ctx.threadTs, result.message);
    } else {
      await postSlackMessage(ctx.channel, result.message, ctx.threadTs);
    }
    return;
  }

  if (pendingDispatch && isCursorDenialMessage(message)) {
    const msg = await denyPendingCursorDispatch(supabase, pendingDispatch.pending, {
      channel: ctx.channel,
      threadTs: ctx.threadTs,
    });
    await postSlackMessage(ctx.channel, msg, ctx.threadTs);
    return;
  }

  if (isTaskStopMessage(message)) {
    await handleTaskStopMessage(supabase, ctx.channel, ctx.threadTs);
    return;
  }

  if (isCursorApprovalMessage(message) && !pendingDispatch && !pendingLinearDelegate) {
    await postSlackMessage(
      ctx.channel,
      'No pending Cursor handoff in this thread. Ask me to implement a TRA ticket (e.g. *fix TRA-123*), or reply *stop* if an old task is stuck.',
      ctx.threadTs
    );
    return;
  }

  if (isCursorApprovalMessage(message) || isCursorDenialMessage(message)) {
    return;
  }

  const history: BrainMessage[] = existing?.messages ? [...existing.messages] : [];

  const placeholder = await postSlackMessageReturningTs(
    ctx.channel,
    pickSlackAckPhrase(),
    ctx.threadTs
  );
  if (!placeholder.ok || !placeholder.ts) {
    console.error('[brain/slack] failed to post ack:', placeholder.error);
    return;
  }

  let result;
  try {
    const statusLookup = await tryTicketStatusLookup({ message, history });
    if (statusLookup) {
      result = {
        reply: statusLookup.reply,
        messages: statusLookup.messages,
        toolEvents: [],
      };
    } else {
      const delegateStart = await tryStartLinearCursorDelegateFlow({
        message,
        history,
        supabase,
        conversationId,
        channel: ctx.channel,
        threadTs: ctx.threadTs,
        employeeId: employee.employeeId,
      });

      if (delegateStart) {
        if (delegateStart.conversationId) {
          conversationId = delegateStart.conversationId;
        }
        result = {
          reply: delegateStart.reply,
          messages: delegateStart.messages,
          toolEvents: [],
        };
      } else {
        const kickoff = await tryOrchestrationKickoff({
          message,
          history,
          ctx,
          supabase,
          employeeId: employee.employeeId,
          conversationId,
        });

        if (kickoff) {
          result = kickoff;
        } else {
          const mem0UserId = resolveMem0UserId({
            employeeEmail: employee.employeeEmail,
            employeeId: employee.employeeId,
            slackUserId: ctx.userId,
          });
          const memoryHits = isMem0Configured()
            ? (await safeSearchMemories(message, mem0UserId)).memories
            : [];

          history.push({ role: 'user', content: message });
          result = await runBrainAgent(
            history,
            { supabase, employeeId: employee.employeeId },
            employee.employeeName,
            {
              surface: 'slack',
              conversationId,
              slackChannel: ctx.channel,
              slackThreadTs: ctx.threadTs,
              slackUserId: ctx.userId,
              maxIterations: isLinearTicketCreateIntent(message)
                ? TICKET_CREATE_MAX_TOOL_ITERATIONS
                : undefined,
              systemAppend: mergeMemoryIntoSystemAppend(
                buildSlackOrchestrationAppend(message, history.slice(0, -1)),
                memoryHits
              ),
            }
          );

          // Fire-and-forget: extract durable facts from this turn
          void addConversationMemories(
            [
              { role: 'user', content: message },
              { role: 'assistant', content: result.reply.slice(0, 4000) },
            ],
            mem0UserId,
            { surface: 'slack', channel: ctx.channel }
          );
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Agent run failed';
    console.error('[brain/slack] agent error:', err);
    await replaceSlackThreadReply(ctx.channel, placeholder.ts, ctx.threadTs, `Error: ${msg}`);
    return;
  }

  conversationId = await saveSlackConversation(
    conversationId,
    convoTitle,
    employee.employeeId,
    result.messages
  );

  if (result.toolEvents.length > 0) {
    const logRows = result.toolEvents.map(e => ({
      source: 'chat' as const,
      conversation_id: conversationId,
      skill_name: e.name,
      connector_name: e.connector || e.name.split('_')[0] || null,
      input: sanitizeForActionLog(e.input),
      output: e.ok ? sanitizeForActionLog(e.output) : null,
      status: e.ok ? 'success' : 'failed',
      error: e.error ? String(sanitizeForActionLog(e.error)) : null,
    }));
    await supabase.from('brain_action_log').insert(logRows);
  }

  const slackText = formatAgentReplyForSlack(result.reply, result.toolEvents);
  const replaced = await replaceSlackThreadReply(
    ctx.channel,
    placeholder.ts,
    ctx.threadTs,
    slackText
  );
  if (!replaced.ok) {
    console.error('[brain/slack] failed to update reply:', replaced.error);
  }
}

/** Strip bot @mention from channel messages. */
export function stripBotMention(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/g, '').trim();
}
