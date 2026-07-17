import { postBriefingToSlack } from '../briefing/slack';
import { postSlackMessage } from '../slack/client';
import { getBrainSlackChannelId } from '../slack/verify';
import { BrainCursorWatchRow, CursorWatchNotifyKind } from './store';

export interface CursorWatchNotifyPayload {
  watch: BrainCursorWatchRow;
  kind: CursorWatchNotifyKind;
  linearStateName: string;
  summary?: string | null;
  prUrl?: string | null;
  branch?: string | null;
  agentUrl?: string | null;
  runStatus?: string | null;
}

function formatWatchSlackMessage(payload: CursorWatchNotifyPayload): string {
  const { watch, kind, linearStateName } = payload;
  const title = watch.issue_title ? ` — ${watch.issue_title}` : '';
  const issueUrl = watch.issue_url || `https://linear.app/trailblaize/issue/${watch.linear_issue_id}`;
  const prLine = payload.prUrl
    ? `PR: ${payload.prUrl}`
    : payload.branch
      ? `Branch: \`${payload.branch}\``
      : null;

  if (kind === 'finished') {
    return [
      `*Cursor agent finished* — ready to review`,
      `*\`${watch.linear_issue_id}\`*${title}`,
      `Linear: *${linearStateName}* (still In Progress)`,
      issueUrl,
      prLine,
      payload.summary ? payload.summary.slice(0, 300) : null,
      payload.agentUrl ? `<${payload.agentUrl}|View agent>` : null,
      '_Continue in Linear / review the PR when ready._',
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    `*Cursor agent failed*`,
    `*\`${watch.linear_issue_id}\`*${title}`,
    `Linear: *${linearStateName}*`,
    issueUrl,
    payload.runStatus ? `Run status: *${payload.runStatus}*` : null,
    payload.summary ? payload.summary.slice(0, 300) : null,
    payload.agentUrl ? `<${payload.agentUrl}|View agent>` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export interface CursorWatchNotifyResult {
  brainOk: boolean;
  threadOk: boolean;
  targets: string[];
  error?: string;
}

/** Always notify #trailblaize-brain; also reply in origin thread when known. */
export async function notifyCursorWatchSlack(
  payload: CursorWatchNotifyPayload
): Promise<CursorWatchNotifyResult> {
  const text = formatWatchSlackMessage(payload);
  const targets: string[] = [];
  const errors: string[] = [];

  const brain = await postBriefingToSlack(text);
  if (brain.ok) {
    targets.push(...brain.targets);
  } else if (brain.attempted) {
    errors.push(brain.error || 'brain channel post failed');
  } else {
    // Fallback if briefing helpers not configured but channel id exists
    const channelId = getBrainSlackChannelId();
    if (channelId) {
      const r = await postSlackMessage(channelId, text);
      if (r.ok) targets.push(`channel:${channelId}`);
      else errors.push(r.error || 'brain channel fallback failed');
    } else {
      errors.push(brain.error || 'SLACK_BRAIN_CHANNEL_ID not configured');
    }
  }

  let threadOk = false;
  const { slack_channel, slack_thread_ts } = payload.watch;
  if (slack_channel && slack_thread_ts) {
    const r = await postSlackMessage(slack_channel, text, slack_thread_ts);
    threadOk = r.ok;
    if (r.ok) targets.push(`thread:${slack_channel}`);
    else errors.push(r.error || 'origin thread post failed');
  }

  return {
    brainOk: targets.some(
      t => t.startsWith('channel:') || t === 'webhook' || t.startsWith('dm:')
    ),
    threadOk,
    targets,
    error: errors.length ? errors.join('; ') : undefined,
  };
}
