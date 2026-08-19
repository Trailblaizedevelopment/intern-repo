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
import { loadPrivacySettings, hydrateIntroducibleHit, type ScoutRejection } from '@/lib/scout/search';
import { introStatusLine, pathwayStatusLine } from '@/lib/scout/intro-status';
import { validateOutbound, type ValidationResult } from '@/lib/scout/validate';
import { persistTurnLog, persistSkipLog, flagInbound } from '@/lib/scout/turn-log';
import type { SearchHitIntroducible } from '@/lib/scout/search';
import {
  MAX_UNANSWERED_OUTBOUND,
  FOLLOWUP_RECENCY_HOURS,
  hoursSinceLastInbound,
} from '@/lib/scout/followup';
import { enrichProfileFromPlatform, toDiscoveryProfile } from '@/lib/scout/discovery';
import {
  capabilitiesPromptBlock,
  DEFAULT_CAPABILITIES,
  loadCapabilities,
} from '@/lib/scout/product';
import { memberHasContactMatches } from '@/lib/scout/contacts';
import { emitActivationEvent, personaFromStatus } from '@/lib/scout/events';

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

function textFromAnthropicContent(content: AnthropicContent[]): string | null {
  const parts = content
    .filter((b): b is Extract<AnthropicContent, { type: 'text' }> => b.type === 'text')
    .map(b => b.text.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const joined = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (!joined) return null;
  return joined.length > 500 ? joined.slice(0, 500).trim() : joined;
}

function sendReplyToolDef() {
  const tool = SCOUT_TOOLS.find(t => t.name === 'send_reply');
  if (!tool) throw new Error('send_reply tool missing');
  return tool;
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

async function loadOpenPathways(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  profileId: string
): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('scout_pathways')
    .select('id, status, person:person_id(display_name)')
    .eq('member_id', profileId)
    .in('status', ['drafted', 'member_approved', 'member_edited'])
    .order('updated_at', { ascending: false })
    .limit(10);
  if (error) {
    console.error('[scout/generate] loadOpenPathways failed:', error.message);
    return [];
  }
  return (data || []).map(row => {
    const person = row.person as { display_name?: string } | null;
    return pathwayStatusLine({
      status: row.status as string,
      name: person?.display_name || 'someone',
    });
  });
}

function resolveFirstIntroducible(ctx: ScoutTurnContext): string {
  if (ctx.lastSearchHitIds) {
    for (const id of ctx.lastSearchHitIds) {
      if (ctx.introducibleHits.has(id)) return id;
    }
    return '';
  }
  let bestId = '';
  let bestScore = -Infinity;
  for (const [id, hit] of ctx.introducibleHits) {
    if (hit.score > bestScore) {
      bestScore = hit.score;
      bestId = id;
    }
  }
  return bestId;
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
          hits.set(hit.id, hydrateIntroducibleHit({
            id: hit.id,
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
            sources: hit.sources,
            evidence: hit.evidence,
            suggested_channel: hit.suggested_channel,
            space_name: hit.space_name,
            has_contact_match: hit.has_contact_match,
          }));
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
 * Reply/open turns recover if the model forgets send_reply (text leftover, then forced tool_choice).
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
  const capabilities = dryRun ? { ...DEFAULT_CAPABILITIES } : await loadCapabilities();
  const hasContactMatches = dryRun ? false : await memberHasContactMatches(profileId);
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
  const pathwayStatuses = dryRun ? [] : await loadOpenPathways(supabase, profileId);
  const introStatuses = [...openIntros.map(i => i.statusLine), ...pathwayStatuses];
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
    capabilitiesBlock: capabilitiesPromptBlock(capabilities),
    hasContactMatches,
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
    lastSearchHitIds: null,
    introducibleNames: [],
    sendReplyMessage: null,
    lastProposeIntroId: null,
    lastProposeStatusLine: null,
    sessionReset: false,
    standingIntents,
    alreadyOfferedIds,
    alreadyOfferedNames: [...alreadyOfferedNames],
    capabilities,
    lastDraftedPathwayId: null,
    lastPathwayStatusLine: null,
    draftedPathways: new Map(),
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
      (name === 'propose_intro' || name === 'get_person' || name === 'draft_pathway') &&
      resolved.id === '$first_introducible'
    ) {
      resolved = { ...resolved, id: resolveFirstIntroducible(ctx) };
    }
    if (name === 'confirm_pathway' && resolved.pathway_id === '$last_pathway') {
      resolved = { ...resolved, pathway_id: ctx.lastDraftedPathwayId || '' };
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
            ? 'Start the conversation. This is the first outbound. Always finish by calling send_reply.'
            : type === 'followup'
              ? 'Send a short follow-up if it still makes sense. If not, do not call send_reply.'
              : 'Reply to the member. Always finish by calling send_reply with the SMS text.',
      });
    } else if (type === 'followup' && anthropicMessages[anthropicMessages.length - 1].role === 'assistant') {
      anthropicMessages.push({
        role: 'user',
        content: 'Send a short follow-up if it still makes sense. If not, do not call send_reply.',
      });
    }

    const system = `${SCOUT_SYSTEM_PROMPT}\n\n${memberBlock}`;
    const mustSendReply = type === 'reply' || type === 'open';

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

      // Reply/open must produce SMS. Recover if the model forgot send_reply.
      if (mustSendReply && !ctx.sendReplyMessage) {
        const leftoverText =
          Array.isArray(rawModelOutput) ? textFromAnthropicContent(rawModelOutput as AnthropicContent[]) : null;
        if (leftoverText) {
          await runTool('send_reply', { message: leftoverText });
        }
      }

      if (mustSendReply && !ctx.sendReplyMessage) {
        const lastMsg = anthropicMessages[anthropicMessages.length - 1];
        if (!lastMsg || lastMsg.role === 'assistant') {
          anthropicMessages.push({
            role: 'user',
            content:
              'You did not call send_reply. Call send_reply now with a short SMS for the member (1–3 sentences, under 500 characters). No other tools.',
          });
        }
        const forceRes = await fetch(ANTHROPIC_API_URL, {
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
            tools: [sendReplyToolDef()],
            tool_choice: { type: 'tool', name: 'send_reply' },
            messages: anthropicMessages,
          }),
        });

        if (!forceRes.ok) {
          const errText = await forceRes.text();
          console.error('[scout/generate] forced send_reply error:', forceRes.status, errText);
        } else {
          const forceData = (await forceRes.json()) as {
            content: AnthropicContent[];
            stop_reason: string;
          };
          rawModelOutput = forceData.content;
          anthropicMessages.push({ role: 'assistant', content: forceData.content });
          const forceUses = forceData.content.filter(
            (b): b is Extract<AnthropicContent, { type: 'tool_use' }> => b.type === 'tool_use'
          );
          for (const use of forceUses) {
            if (use.name !== 'send_reply') continue;
            await runTool(use.name, use.input || {});
          }
          if (!ctx.sendReplyMessage) {
            const forcedText = textFromAnthropicContent(forceData.content);
            if (forcedText) await runTool('send_reply', { message: forcedText });
          }
        }
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
  const extraStatus = ctx.lastPathwayStatusLine || ctx.lastProposeStatusLine;
  if (candidate && extraStatus && !/queued|waiting on team|have not been auto-texted|nothing has been sent/i.test(candidate)) {
    const combined = `${candidate} ${extraStatus}`.trim();
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

  if (sent && !dryRun) {
    const eventType = type === 'open' || history.filter(h => h.direction === 'inbound').length <= 1
      ? 'scout_opened'
      : 'repeat_turn';
    await emitActivationEvent({
      memberId: profileId,
      type: eventType,
      communityId: profile.platform_chapter_id,
      industry: profile.industry,
      geo: profile.location,
      persona: personaFromStatus(profile.member_status),
    });
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
