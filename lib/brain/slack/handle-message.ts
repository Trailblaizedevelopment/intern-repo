import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { BrainMessage, runBrainAgent } from '../agent';
import {
  denyPendingCursorDispatch,
  executeApprovedCursorDispatch,
  findPendingDispatchForSlackThread,
  isCursorApprovalMessage,
  isCursorDenialMessage,
} from '../cursor-approval';
import { checkBrainRateLimit } from '../rate-limit';
import { sanitizeForActionLog } from '../sanitize-log';
import { pickSlackAckPhrase } from './ack-phrases';
import { postSlackMessage, postSlackMessageReturningTs, replaceSlackThreadReply } from './client';
import { formatAgentReplyForSlack } from './format-reply';

const MAX_STORED_MESSAGES = 40;

export interface SlackChatContext {
  channel: string;
  threadTs: string;
  userId: string;
}

function slackConversationTitle(channel: string, threadTs: string): string {
  return `slack:${channel}:${threadTs}`;
}

async function resolveEmployee(): Promise<{ employeeId: string | null; employeeName: string | null }> {
  const supabase = getSupabaseAdmin();
  const email = (process.env.BRAIN_BRIEFING_ASSIGNEE_EMAIL || 'devin@trailblaize.net').toLowerCase();

  if (!supabase) {
    return { employeeId: null, employeeName: null };
  }

  const { data: employee } = await supabase
    .from('employees')
    .select('id, name')
    .eq('email', email)
    .maybeSingle();

  return {
    employeeId: employee?.id ?? null,
    employeeName: employee?.name ?? null,
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
  return { id: data.id, messages: (data.messages as BrainMessage[]) || [] };
}

async function saveSlackConversation(
  conversationId: string | null,
  title: string,
  employeeId: string | null,
  messages: BrainMessage[]
): Promise<string> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('Database not configured');

  const stored = messages.slice(-MAX_STORED_MESSAGES);

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

  const history: BrainMessage[] = existing?.messages ? [...existing.messages] : [];

  history.push({ role: 'user', content: message });

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
      }
    );
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
