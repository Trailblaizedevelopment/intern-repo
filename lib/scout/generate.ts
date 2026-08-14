import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  SCOUT_SYSTEM_PROMPT,
  buildMemberContextBlock,
  historyToAnthropicMessages,
  type ScoutConversationMessage,
} from '@/lib/scout/prompt';
import { SCOUT_TOOLS } from '@/lib/scout/tools';
import {
  handleScoutTool,
  loadActiveRejections,
  loadStandingIntents,
  type ScoutTurnContext,
  type StandingIntentRow,
} from '@/lib/scout/tool-handlers';
import { loadPrivacySettings, type ScoutRejection } from '@/lib/scout/search';
import { introStatusLine } from '@/lib/scout/intro-status';
import { validateOutbound, type ValidationResult } from '@/lib/scout/validate';
import { persistTurnLog, persistSkipLog, flagInbound } from '@/lib/scout/turn-log';
import type { SearchHitIntroducible } from '@/lib/scout/search';
import {
  MAX_UNANSWERED_OUTBOUND,
  FOLLOWUP_RECENCY_HOURS,
  hoursSinceLastInbound,
} from '@/lib/scout/followup';
import { enrichProfileFromPlatform, toDiscoveryProfile } from '@/lib/scout/discovery';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1024;
const MAX_TOOL_ITERATIONS = 8;
const HISTORY_LIMIT = 30;

export type ScoutGenerateType = 'open' | 'reply' | 'followup';

export interface ScriptedToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface GenerateScoutOptions {
  dryRun?: boolean;
  historyOverride?: ScoutConversationMessage[];
  scriptedToolCalls?: ScriptedToolCall[];
  seedRejections?: ScoutRejection[];
  seedIntents?: StandingIntentRow[];
  seedAlreadyOffered?: Array<{ id: string; name: string }>;
  recencyHours?: number;
}

export interface GenerateScoutResult {
  message: string | null;
  skipped?: boolean;
  reason?: string;
  shouldStop?: boolean;
  validation?: ValidationResult;
  turnLogId?: string | null;
  toolCalls?: Array<{ name: string; input: unknown }>;
  toolResults?: unknown[];
  historyCount?: number;
  introducibleNames?: string[];
}

type AnthropicContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };

type AnthropicToolResult = {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Array<AnthropicContent | AnthropicToolResult>;
}

export async function loadNewestHistory(
  profileId: string,
  limit = HISTORY_LIMIT
): Promise<ScoutConversationMessage[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data: messages } = await supabase
    .from('scout_conversations')
    .select('direction, message_body, created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(limit);

  const newestFirst = (messages || []) as ScoutConversationMessage[];
  return [...newestFirst].reverse();
}

function unansweredOutboundCount(history: ScoutConversationMessage[]): number {
  let count = 0;
  const startIdx =
    history.length > 0 && history[history.length - 1].direction === 'inbound'
      ? history.length - 2
      : history.length - 1;
  for (let i = startIdx; i >= 0; i--) {
    if (history[i].direction === 'outbound') count++;
    else break;
  }
  return count;
}

function latestInboundText(history: ScoutConversationMessage[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].direction === 'inbound') return history[i].message_body;
  }
  return null;
}

function lastOutboundText(history: ScoutConversationMessage[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].direction === 'outbound') return history[i].message_body;
  }
  return null;
}

function inboundNameHints(text: string | null): string[] {
  if (!text) return [];
  const matches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g) || [];
  return matches;
}

interface OpenIntro {
  id: string;
  name: string;
  status: string;
  statusLine: string;
}

async function loadOpenIntros(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  profileId: string
): Promise<OpenIntro[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from('scout_introductions')
    .select('id, status, platform_target_id, platform_target_snapshot')
    .eq('requester_id', profileId)
    .in('status', ['suggested', 'pending_approval', 'sent'])
    .order('updated_at', { ascending: false })
    .limit(20);
  return (data || []).map(row => {
    const snap = row.platform_target_snapshot as { name?: string } | null;
    const name = snap && typeof snap.name === 'string' ? snap.name : 'that person';
    return {
      id: (row.platform_target_id as string) || (row.id as string),
      name,
      status: row.status as string,
      statusLine: introStatusLine({
        status: row.status as string,
        platform_target_snapshot: snap,
      }),
    };
  });
}

async function hydrateConversationSearch(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  profileId: string,
  allow: Set<string>,
  hits: Map<string, SearchHitIntroducible>
): Promise<void> {
  if (!supabase) return;
  const { data } = await supabase
    .from('scout_turn_logs')
    .select('tool_results')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(15);
  for (const row of data || []) {
    const results = row.tool_results;
    if (!Array.isArray(results)) continue;
    for (const entry of results) {
      if (!entry || typeof entry !== 'object') continue;
      const rec = entry as {
        name?: string;
        result?: { hits?: Array<Partial<SearchHitIntroducible> & { id?: string; introducible?: boolean }> };
      };
      if (rec.name !== 'search_network') continue;
      for (const hit of rec.result?.hits || []) {
        if (!hit.id) continue;
        allow.add(hit.id);
        if (hit.introducible && hit.name && !hits.has(hit.id)) {
          hits.set(hit.id, {
            id: hit.id,
            tier: 1,
            introducible: true,
            name: hit.name,
            role: hit.role ?? null,
            location: hit.location ?? null,
            hometown: hit.hometown ?? null,
            member_status: hit.member_status ?? null,
            company: hit.company ?? null,
            industry: hit.industry ?? null,
            bio: hit.bio ?? null,
            grad_year: hit.grad_year ?? null,
            linkedin_url: hit.linkedin_url ?? null,
            reason: hit.reason || 'prior search hit',
            score: hit.score ?? 0,
          });
        }
      }
    }
  }
}

async function skipGenerate(opts: {
  profileId: string;
  reason: string;
  dryRun: boolean;
  started: number;
  inbound?: string | null;
  historyCount?: number;
  shouldStop?: boolean;
  toolCalls?: Array<{ name: string; input: unknown }>;
  toolResults?: unknown[];
}): Promise<GenerateScoutResult> {
  const turnLogId = await persistSkipLog({
    profileId: opts.profileId,
    reason: opts.reason,
    inboundText: opts.inbound,
    dryRun: opts.dryRun,
    latencyMs: Date.now() - opts.started,
    historyCount: opts.historyCount,
    toolCalls: opts.toolCalls,
    toolResults: opts.toolResults,
  });
  return {
    message: null,
    skipped: true,
    reason: opts.reason,
    shouldStop: opts.shouldStop,
    turnLogId,
    historyCount: opts.historyCount,
    toolCalls: opts.toolCalls,
    toolResults: opts.toolResults,
  };
}

/**
 * Claude plans with tools. Code validates send_reply before anything can go to Linq.
 */
export async function generateScoutMessage(
  profileId: string,
  type: ScoutGenerateType,
  opts: GenerateScoutOptions = {}
): Promise<GenerateScoutResult> {
  const started = Date.now();
  const dryRun = Boolean(opts.dryRun);
  const apiKey = process.env.ANTHROPIC_API_KEY;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { message: null, skipped: true, reason: 'db_not_configured' };
  }

  const { data: profileRow, error: profileErr } = await supabase
    .from('scout_profiles')
    .select('*')
    .eq('id', profileId)
    .single();

  if (profileErr || !profileRow) {
    return { message: null, skipped: true, reason: 'profile_not_found' };
  }

  if (profileRow.opt_in_status === 'opted_out') {
    return skipGenerate({
      profileId,
      reason: 'opted_out',
      dryRun,
      started,
      shouldStop: true,
    });
  }

  const history =
    opts.historyOverride && opts.historyOverride.length > 0
      ? opts.historyOverride.slice(-HISTORY_LIMIT)
      : await loadNewestHistory(profileId, HISTORY_LIMIT);
  const inboundEarly = latestInboundText(history);

  if (type === 'reply' || type === 'followup') {
    if (unansweredOutboundCount(history) >= MAX_UNANSWERED_OUTBOUND) {
      return skipGenerate({
        profileId,
        reason: 'max_unanswered_followups',
        dryRun,
        started,
        inbound: inboundEarly,
        historyCount: history.length,
      });
    }
  }

  if (type === 'followup') {
    const recencyHours = opts.recencyHours ?? FOLLOWUP_RECENCY_HOURS;
    const hours = await hoursSinceLastInbound(profileId);
    if (hours != null && hours < recencyHours) {
      return skipGenerate({
        profileId,
        reason: 'inbound_recency',
        dryRun,
        started,
        inbound: inboundEarly,
        historyCount: history.length,
      });
    }
  }

  const profile = await enrichProfileFromPlatform(toDiscoveryProfile(profileRow));
  const privacy = await loadPrivacySettings();
  const dbRejections = opts.seedRejections || (await loadActiveRejections(supabase, profileId));
  const standingIntents = await loadStandingIntents(supabase, profileId, opts.seedIntents);
  const openIntros: OpenIntro[] = dryRun
    ? (opts.seedAlreadyOffered || []).map(o => ({
        id: o.id,
        name: o.name,
        status: 'suggested',
        statusLine: `${o.name} — already offered (queued).`,
      }))
    : await loadOpenIntros(supabase, profileId);
  const introStatuses = openIntros.map(i => i.statusLine);
  const alreadyOfferedNames = [...new Set(openIntros.map(i => i.name))];
  const alreadyOfferedIds = new Set(openIntros.map(i => i.id));
  const inbound = latestInboundText(history);
  const lastOutbound = lastOutboundText(history);

  const memberBlock = buildMemberContextBlock({
    name: profile.name,
    chapter: profile.chapter,
    university: profile.university,
    graduation_year: profile.graduation_year,
    current_title: profile.current_title,
    career_interest: profile.career_interest,
    looking_for: profile.looking_for,
    goals: Array.isArray(profile.goals)
      ? profile.goals.filter((g): g is string => typeof g === 'string')
      : [],
    skills: Array.isArray(profile.skills)
      ? profile.skills.filter((s): s is string => typeof s === 'string')
      : [],
    location: profile.location,
    member_status: profile.member_status,
    industry: profile.industry,
    company: profile.company,
    job_title: profile.job_title,
    hometown: profile.hometown,
    linkedin_url: profile.linkedin_url,
    bio: profile.bio,
    rejections: dbRejections.map(r => ({ type: r.type, value: r.value })),
    introStatuses,
    alreadyOfferedNames,
    standingIntents: standingIntents.map(i => ({
      id: i.id,
      description: i.description,
      location: i.location,
      industry: i.industry,
      effective_status: i.effective_status,
    })),
    sessionOfferSuppressed: Boolean(profileRow.session_offer_suppressed),
    consecutiveDeclines: Number(profileRow.session_consecutive_declines || 0),
  });

  const ctx: ScoutTurnContext = {
    profileId,
    profile: {
      id: profile.id,
      name: profile.name,
      platform_chapter_id: profile.platform_chapter_id,
      source_type: profile.source_type,
      source_id: profile.source_id,
      looking_for: profile.looking_for,
      career_interest: profile.career_interest,
      location: profile.location,
      industry: profile.industry,
      goals: profile.goals,
      opt_in_status: profileRow.opt_in_status,
      session_offer_suppressed: Boolean(profileRow.session_offer_suppressed),
      session_consecutive_declines: Number(profileRow.session_consecutive_declines || 0),
    },
    supabase,
    dryRun,
    inboundText: inbound,
    privacy,
    rejections: [...dbRejections],
    searchAllowlist: new Set(),
    introducibleHits: new Map(),
    introducibleNames: [],
    sendReplyMessage: null,
    lastProposeIntroId: null,
    lastProposeStatusLine: null,
    sessionReset: false,
    standingIntents,
    alreadyOfferedIds,
    alreadyOfferedNames: [...alreadyOfferedNames],
  };

  if (!dryRun) {
    await hydrateConversationSearch(supabase, profileId, ctx.searchAllowlist, ctx.introducibleHits);
  }

  const recordedCalls: Array<{ name: string; input: unknown }> = [];
  const recordedResults: unknown[] = [];
  let rawModelOutput: unknown = null;

  const runTool = async (name: string, input: Record<string, unknown>) => {
    let resolved = input;
    if (
      (name === 'propose_intro' || name === 'get_person') &&
      resolved.id === '$first_introducible'
    ) {
      const first = [...ctx.introducibleHits.keys()][0] || '';
      resolved = { ...resolved, id: first };
    }
    recordedCalls.push({ name, input: resolved });
    const result = await handleScoutTool(name, resolved, ctx);
    recordedResults.push({ name, result });
    return result;
  };

  if (opts.scriptedToolCalls) {
    for (const call of opts.scriptedToolCalls) {
      await runTool(call.name, call.input);
    }
  } else {
    if (!apiKey) {
      return skipGenerate({
        profileId,
        reason: 'missing_api_key',
        dryRun,
        started,
        inbound,
        historyCount: history.length,
      });
    }

    const anthropicMessages: AnthropicMessage[] = historyToAnthropicMessages(history);
    if (anthropicMessages.length === 0) {
      anthropicMessages.push({
        role: 'user',
        content:
          type === 'open'
            ? 'Start the conversation. This is the first outbound.'
            : type === 'followup'
              ? 'Send a short follow-up if it still makes sense. If not, do not call send_reply.'
              : 'Reply to the member.',
      });
    } else if (type === 'followup' && anthropicMessages[anthropicMessages.length - 1].role === 'assistant') {
      anthropicMessages.push({
        role: 'user',
        content: 'Send a short follow-up if it still makes sense. If not, do not call send_reply.',
      });
    }

    const system = `${SCOUT_SYSTEM_PROMPT}\n\n${memberBlock}`;

    try {
      for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
        const res = await fetch(ANTHROPIC_API_URL, {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system,
            tools: SCOUT_TOOLS,
            messages: anthropicMessages,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error('[scout/generate] Anthropic error:', res.status, errText);
          return skipGenerate({
            profileId,
            reason: 'ai_error',
            dryRun,
            started,
            inbound,
            historyCount: history.length,
            toolCalls: recordedCalls,
            toolResults: recordedResults,
          });
        }

        const data = (await res.json()) as {
          content: AnthropicContent[];
          stop_reason: string;
        };
        rawModelOutput = data.content;
        anthropicMessages.push({ role: 'assistant', content: data.content });

        const toolUses = data.content.filter(
          (b): b is Extract<AnthropicContent, { type: 'tool_use' }> => b.type === 'tool_use'
        );

        if (data.stop_reason !== 'tool_use' || toolUses.length === 0) {
          break;
        }

        const results: AnthropicToolResult[] = [];
        let sentThisRound = false;
        for (const use of toolUses) {
          const result = await runTool(use.name, use.input || {});
          if (use.name === 'send_reply') sentThisRound = true;
          const isError =
            result &&
            typeof result === 'object' &&
            'error' in result &&
            Boolean((result as { error?: unknown }).error);
          results.push({
            type: 'tool_result',
            tool_use_id: use.id,
            content: JSON.stringify(result),
            is_error: Boolean(isError),
          });
        }
        anthropicMessages.push({ role: 'user', content: results });
        if (sentThisRound) break;
      }
    } catch (err) {
      console.error('[scout/generate] loop error:', err);
      return skipGenerate({
        profileId,
        reason: 'ai_error',
        dryRun,
        started,
        inbound,
        historyCount: history.length,
        toolCalls: recordedCalls,
        toolResults: recordedResults,
      });
    }
  }

  let candidate = ctx.sendReplyMessage;
  if (candidate && ctx.lastProposeStatusLine && !/queued|waiting on team|have not been auto-texted/i.test(candidate)) {
    const combined = `${candidate} ${ctx.lastProposeStatusLine}`.trim();
    if (combined.length <= 500) candidate = combined;
  }

  let validation: ValidationResult | undefined;
  let sent: string | null = null;
  let reason: string | undefined;

  if (!candidate) {
    reason = 'no_send_reply';
  } else {
    validation = validateOutbound(
      candidate,
      {
        introducibleNames: ctx.introducibleNames,
        inboundNames: inboundNameHints(inbound),
        rejectedNames: ctx.rejections.filter(r => r.type === 'person').map(r => r.value),
      },
      lastOutbound
    );
    if (!validation.ok) {
      reason = 'validation_failed';
      if (!dryRun) {
        await flagInbound(profileId, `validation_failed: ${validation.reasons.join(',')}`);
      }
    } else {
      sent = candidate;
    }
  }

  const validationPayload = validation
    ? { ...validation, skip_reason: validation.ok ? undefined : reason }
    : { ok: false, reasons: [reason || 'no_send_reply'], skip_reason: reason || 'no_send_reply' };

  const turnLogId = await persistTurnLog({
    profile_id: profileId,
    inbound_text: inbound,
    tool_calls: recordedCalls,
    tool_results: recordedResults.map(r => {
      if (!r || typeof r !== 'object') return r;
      const row = r as { name?: string; result?: unknown };
      return { name: row.name, result: row.result };
    }),
    rejection_set: ctx.rejections,
    raw_model_output: rawModelOutput,
    validation: validationPayload,
    sent_text: dryRun ? null : sent,
    latency_ms: Date.now() - started,
    dry_run: dryRun,
  });

  if (!sent) {
    return {
      message: null,
      skipped: true,
      reason,
      validation: validationPayload,
      turnLogId,
      toolCalls: recordedCalls,
      toolResults: recordedResults,
      historyCount: history.length,
      introducibleNames: ctx.introducibleNames,
    };
  }

  return {
    message: sent,
    validation,
    turnLogId,
    toolCalls: recordedCalls,
    toolResults: recordedResults,
    historyCount: history.length,
    introducibleNames: ctx.introducibleNames,
  };
}
