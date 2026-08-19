import type { SupabaseClient } from '@supabase/supabase-js';
import { introStatusLine, pathwayStatusLine } from '@/lib/scout/intro-status';
import { computeTieStrength, type TieFeatures } from '@/lib/scout/ties';
import {
  searchNetwork,
  sanitizeToolSearchResult,
  type ScoutProfileForSearch,
  type ScoutRejection,
  type SearchHitIntroducible,
  type SearchNetworkInput,
} from '@/lib/scout/search';
import type { ScoutPrivacySettings } from '@/lib/scout/privacy';
import { computeProfileComplete, toDiscoveryProfile } from '@/lib/scout/discovery';
import {
  ACTION_CHANNELS,
  isChannelAvailable,
  sourceToPeopleRow,
  type ActionChannel,
  type OutcomeKind,
  type ScoutCapabilities,
} from '@/lib/scout/product';
import { emitActivationEvent, personaFromStatus } from '@/lib/scout/events';

export interface StandingIntentRow {
  id: string;
  description: string;
  location: string | null;
  industry: string | null;
  status: string;
  expires_at: string | null;
  last_confirmed_at: string | null;
  effective_status: string;
}

export interface ScoutTurnContext {
  profileId: string;
  profile: ScoutProfileForSearch & {
    name: string;
    looking_for: string | null;
    location: string | null;
    session_offer_suppressed?: boolean;
    session_consecutive_declines?: number;
  };
  supabase: SupabaseClient;
  dryRun: boolean;
  inboundText: string | null;
  privacy: ScoutPrivacySettings;
  rejections: ScoutRejection[];
  searchAllowlist: Set<string>;
  introducibleHits: Map<string, SearchHitIntroducible>;
  /** Introducible ids from this turn's latest search_network call, in rank order. Null if none yet. */
  lastSearchHitIds: string[] | null;
  introducibleNames: string[];
  sendReplyMessage: string | null;
  lastProposeIntroId: string | null;
  lastProposeStatusLine: string | null;
  sessionReset: boolean;
  standingIntents: StandingIntentRow[];
  alreadyOfferedIds: Set<string>;
  alreadyOfferedNames: string[];
  capabilities: ScoutCapabilities;
  lastDraftedPathwayId: string | null;
  lastPathwayStatusLine: string | null;
  draftedPathways: Map<
    string,
    { id: string; platformProfileId: string; channel: ActionChannel; name: string }
  >;
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
  return out.length > 0 ? out : undefined;
}

function sanitizePersonHit(hit: SearchHitIntroducible): Record<string, unknown> {
  const includeLinkedIn = hit.suggested_channel === 'linkedin_linkout';
  return {
    id: hit.id,
    name: hit.name,
    role: hit.role,
    location: hit.location,
    hometown: hit.hometown,
    member_status: hit.member_status,
    company: hit.company,
    industry: hit.industry,
    bio: hit.bio,
    grad_year: hit.grad_year,
    reason: hit.reason,
    sources: hit.sources,
    evidence: hit.evidence,
    suggested_channel: hit.suggested_channel,
    space_name: hit.space_name,
    has_contact_match: hit.has_contact_match,
    ...(includeLinkedIn ? { linkedin_url: hit.linkedin_url } : {}),
  };
}

async function upsertPathwayPerson(
  ctx: ScoutTurnContext,
  hit: SearchHitIntroducible
): Promise<string> {
  if (ctx.dryRun) return `dry-run-person-${hit.id}`;
  const source = sourceToPeopleRow(hit.sources[0] || 'trailblaize_community');
  const { data: existing } = await ctx.supabase
    .from('scout_people')
    .select('id')
    .eq('member_id', ctx.profileId)
    .eq('platform_profile_id', hit.id)
    .maybeSingle();
  if (existing?.id) {
    await ctx.supabase
      .from('scout_people')
      .update({
        display_name: hit.name,
        unresolved: false,
        source,
        matched_platform_profile_id: hit.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    return existing.id as string;
  }
  const { data, error } = await ctx.supabase
    .from('scout_people')
    .insert({
      member_id: ctx.profileId,
      platform_profile_id: hit.id,
      display_name: hit.name,
      unresolved: false,
      source,
      matched_platform_profile_id: hit.id,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message || 'person_insert_failed');
  return data.id as string;
}

async function queueOpsIntro(
  ctx: ScoutTurnContext,
  hit: SearchHitIntroducible,
  reason: string,
  pathwayId: string | null
): Promise<{ introId: string; status: string }> {
  const snapshot = {
    name: hit.name,
    role: hit.role,
    location: hit.location,
    hometown: hit.hometown,
    member_status: hit.member_status,
    grad_year: hit.grad_year,
    linkedin_url: hit.suggested_channel === 'linkedin_linkout' ? hit.linkedin_url : null,
    bio: hit.bio,
    reason,
  };
  let introId = 'dry-run-intro';
  let status = 'suggested';
  if (!ctx.dryRun) {
    const { data: existing } = await ctx.supabase
      .from('scout_introductions')
      .select('id, status')
      .eq('requester_id', ctx.profileId)
      .eq('platform_target_id', hit.id)
      .maybeSingle();
    const extra: Record<string, unknown> = {
      reason: snapshot.reason,
      platform_target_snapshot: snapshot,
      action_channel: 'trailblaize_ops_intro',
      updated_at: new Date().toISOString(),
    };
    if (pathwayId) extra.pathway_id = pathwayId;
    if (existing) {
      introId = existing.id as string;
      status = (existing.status as string) || 'suggested';
      const locked = status === 'sent' || status === 'accepted';
      if (!locked) {
        await ctx.supabase
          .from('scout_introductions')
          .update({ ...extra, status: 'suggested' })
          .eq('id', introId);
        status = 'suggested';
      }
    } else {
      const { data, error } = await ctx.supabase
        .from('scout_introductions')
        .insert({
          requester_id: ctx.profileId,
          target_id: null,
          platform_target_id: hit.id,
          platform_target_snapshot: snapshot,
          reason: snapshot.reason,
          status: 'suggested',
          pathway_id: pathwayId,
          action_channel: 'trailblaize_ops_intro',
        })
        .select('id, status')
        .single();
      if (error || !data) throw new Error(error?.message || 'intro_insert_failed');
      introId = data.id as string;
      status = data.status as string;
    }
  }
  ctx.lastProposeIntroId = introId;
  ctx.lastProposeStatusLine = introStatusLine({
    status,
    platform_target_snapshot: { name: hit.name },
  });
  ctx.alreadyOfferedIds.add(hit.id);
  if (!ctx.alreadyOfferedNames.includes(hit.name)) {
    ctx.alreadyOfferedNames.push(hit.name);
  }
  return { introId, status };
}

export function effectiveIntentStatus(row: {
  status: string;
  expires_at: string | null;
}): string {
  if (row.status === 'active' && row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return 'unconfirmed';
  }
  return row.status;
}

export async function loadActiveRejections(
  supabase: SupabaseClient,
  memberId: string
): Promise<ScoutRejection[]> {
  const { data } = await supabase
    .from('scout_rejections')
    .select('type, value, person_id, platform_profile_id')
    .eq('member_id', memberId)
    .is('lifted_at', null);
  return (data || []) as ScoutRejection[];
}

export async function loadStandingIntents(
  supabase: SupabaseClient,
  memberId: string,
  dryRunSeed?: StandingIntentRow[]
): Promise<StandingIntentRow[]> {
  if (dryRunSeed) {
    return dryRunSeed.map(r => ({ ...r, effective_status: effectiveIntentStatus(r) }));
  }
  const { data } = await supabase
    .from('scout_standing_intents')
    .select('id, description, location, industry, status, expires_at, last_confirmed_at')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(20);

  const rows = (data || []) as Omit<StandingIntentRow, 'effective_status'>[];
  const out: StandingIntentRow[] = [];
  for (const row of rows) {
    const effective = effectiveIntentStatus(row);
    if (effective !== row.status && !dryRunSeed) {
      await supabase
        .from('scout_standing_intents')
        .update({ status: 'unconfirmed' })
        .eq('id', row.id)
        .eq('status', 'active');
    }
    out.push({ ...row, status: effective === 'unconfirmed' ? 'unconfirmed' : row.status, effective_status: effective });
  }
  return out;
}

async function persistRejection(ctx: ScoutTurnContext, row: ScoutRejection): Promise<void> {
  ctx.rejections.push(row);
  if (ctx.dryRun) return;
  await ctx.supabase.from('scout_rejections').insert({
    member_id: ctx.profileId,
    type: row.type,
    value: row.value,
    person_id: row.person_id || null,
    platform_profile_id: row.platform_profile_id || null,
  });
}

export async function handleScoutTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ScoutTurnContext
): Promise<unknown> {
  switch (name) {
    case 'search_network': {
      if (ctx.profile.session_offer_suppressed || (ctx.profile.session_consecutive_declines || 0) > 0) {
        ctx.profile.session_offer_suppressed = false;
        ctx.profile.session_consecutive_declines = 0;
        if (!ctx.dryRun) {
          await ctx.supabase
            .from('scout_profiles')
            .update({
              session_offer_suppressed: false,
              session_consecutive_declines: 0,
              updated_at: new Date().toISOString(),
            })
            .eq('id', ctx.profileId);
        }
      }
      const intentSnippets = ctx.standingIntents
        .filter(i => i.effective_status === 'active')
        .flatMap(i => {
          const bits: string[] = [];
          if (i.location) bits.push(i.location);
          if (i.industry) bits.push(i.industry);
          if (i.description) bits.push(i.description.slice(0, 80));
          return bits;
        });
      const result = await searchNetwork(
        ctx.profile,
        {
          ...(input as SearchNetworkInput),
          exclude_ids: [...ctx.alreadyOfferedIds],
          intent_snippets: intentSnippets,
        },
        ctx.rejections,
        ctx.privacy
      );
      ctx.lastSearchHitIds = result.hits
        .filter((h): h is SearchHitIntroducible => h.introducible)
        .map(h => h.id);
      for (const hit of result.hits) {
        ctx.searchAllowlist.add(hit.id);
        if (hit.introducible) {
          ctx.introducibleHits.set(hit.id, hit);
          if (!ctx.introducibleNames.includes(hit.name)) {
            ctx.introducibleNames.push(hit.name);
          }
        }
      }
      const sanitized = sanitizeToolSearchResult(result) as Record<string, unknown>;
      if (ctx.dryRun) {
        sanitized.query_tokens = result.query_tokens;
        sanitized.exclude_ids = [...ctx.alreadyOfferedIds];
      }
      return sanitized;
    }

    case 'get_person': {
      const id = asString(input.id);
      if (!id) return { error: 'id_required', status: 400 };
      const hit = ctx.introducibleHits.get(id);
      if (!hit || !ctx.searchAllowlist.has(id)) {
        return { error: 'not_allowlisted_or_not_introducible', status: 403 };
      }
      return sanitizePersonHit(hit);
    }

    case 'draft_pathway': {
      const id = asString(input.id);
      const draftText = asString(input.draft_text);
      if (!id) return { error: 'id_required', status: 400 };
      if (!draftText) return { error: 'draft_text_required', status: 400 };
      const hit = ctx.introducibleHits.get(id);
      if (!hit) return { error: 'not_introducible_or_unknown', status: 403 };
      if (
        ctx.rejections.some(
          r =>
            r.type === 'person' &&
            (r.platform_profile_id === id || r.value.toLowerCase() === hit.name.toLowerCase())
        )
      ) {
        return { error: 'person_rejected', status: 403 };
      }
      let channel = hit.suggested_channel;
      const channelOverride = asString(input.channel) as ActionChannel | undefined;
      if (channelOverride) {
        if (!ACTION_CHANNELS.includes(channelOverride)) {
          return { error: 'invalid_channel', status: 400 };
        }
        if (!isChannelAvailable(channelOverride, ctx.capabilities)) {
          return {
            error: 'channel_unavailable',
            status: 403,
            note: `${channelOverride} is not available. Do not claim it was sent.`,
          };
        }
        channel = channelOverride;
      }
      let pathwayId = `dry-run-pathway-${id}`;
      let personId: string | null = null;
      if (!ctx.dryRun) {
        try {
          personId = await upsertPathwayPerson(ctx, hit);
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'person_insert_failed', status: 500 };
        }
        const { data, error } = await ctx.supabase
          .from('scout_pathways')
          .insert({
            member_id: ctx.profileId,
            person_id: personId,
            platform_profile_id: hit.id,
            sources: hit.sources,
            evidence: hit.evidence,
            suggested_channel: channel,
            draft_text: draftText,
            status: 'drafted',
          })
          .select('id')
          .single();
        if (error || !data) return { error: error?.message || 'pathway_insert_failed', status: 500 };
        pathwayId = data.id as string;
        await emitActivationEvent({
          memberId: ctx.profileId,
          type: 'pathway_drafted',
          communityId: ctx.profile.platform_chapter_id,
          industry: hit.industry || ctx.profile.industry,
          geo: hit.location,
          persona: personaFromStatus(hit.member_status),
          pathwayId,
        });
      }
      ctx.lastDraftedPathwayId = pathwayId;
      ctx.lastPathwayStatusLine = pathwayStatusLine({ status: 'drafted', name: hit.name });
      ctx.draftedPathways.set(pathwayId, {
        id: pathwayId,
        platformProfileId: hit.id,
        channel,
        name: hit.name,
      });
      return {
        pathway_id: pathwayId,
        status: 'drafted',
        name: hit.name,
        sources: hit.sources,
        evidence: hit.evidence,
        suggested_channel: channel,
        status_line: ctx.lastPathwayStatusLine,
        reminder: 'Member must review this draft. Nobody has been contacted.',
      };
    }

    case 'confirm_pathway': {
      const pathwayId = asString(input.pathway_id);
      const decision = asString(input.decision);
      if (!pathwayId || !decision) return { error: 'pathway_id_and_decision_required', status: 400 };
      if (!['approved', 'edited', 'declined'].includes(decision)) {
        return { error: 'invalid_decision', status: 400 };
      }
      const drafted = ctx.draftedPathways.get(pathwayId);
      let platformId = drafted?.platformProfileId;
      let channel: ActionChannel = drafted?.channel || 'trailblaize_ops_intro';
      let name = drafted?.name || 'that person';
      if (!ctx.dryRun) {
        const { data: row } = await ctx.supabase
          .from('scout_pathways')
          .select('id, platform_profile_id, suggested_channel, chosen_channel, status')
          .eq('id', pathwayId)
          .eq('member_id', ctx.profileId)
          .maybeSingle();
        if (!row) return { error: 'pathway_not_found', status: 404 };
        platformId = (row.platform_profile_id as string) || platformId;
        channel = ((row.chosen_channel || row.suggested_channel) as ActionChannel) || channel;
      }
      if (decision === 'declined') {
        if (!ctx.dryRun) {
          await ctx.supabase
            .from('scout_pathways')
            .update({
              status: 'declined',
              member_reviewed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', pathwayId);
        }
        ctx.lastPathwayStatusLine = pathwayStatusLine({ status: 'declined', name });
        return { ok: true, pathway_id: pathwayId, status: 'declined', status_line: ctx.lastPathwayStatusLine };
      }
      const editedDraft = asString(input.draft_text);
      if (decision === 'edited' && !editedDraft) {
        return { error: 'draft_text_required_when_edited', status: 400 };
      }
      const status = decision === 'edited' ? 'member_edited' : 'member_approved';
      const patch: Record<string, unknown> = {
        status,
        member_reviewed_at: new Date().toISOString(),
        chosen_channel: channel,
        updated_at: new Date().toISOString(),
      };
      if (editedDraft) patch.draft_text = editedDraft;
      if (!ctx.dryRun) {
        await ctx.supabase.from('scout_pathways').update(patch).eq('id', pathwayId);
      }
      ctx.lastPathwayStatusLine = pathwayStatusLine({ status, name });

      let intro: { introId: string; status: string } | null = null;
      const hit = platformId ? ctx.introducibleHits.get(platformId) : undefined;
      if (channel === 'trailblaize_ops_intro' && hit) {
        try {
          intro = await queueOpsIntro(ctx, hit, hit.reason, pathwayId);
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'intro_queue_failed', status: 500 };
        }
        if (!ctx.dryRun) {
          await ctx.supabase
            .from('scout_introductions')
            .update({ member_reviewed_at: new Date().toISOString() })
            .eq('id', intro.introId);
          await emitActivationEvent({
            memberId: ctx.profileId,
            type: 'intro_requested',
            communityId: ctx.profile.platform_chapter_id,
            industry: hit.industry || ctx.profile.industry,
            geo: hit.location,
            persona: personaFromStatus(hit.member_status),
            pathwayId,
            introId: intro.introId,
          });
        }
      } else if (!ctx.dryRun) {
        await emitActivationEvent({
          memberId: ctx.profileId,
          type: 'intro_requested',
          communityId: ctx.profile.platform_chapter_id,
          industry: ctx.profile.industry,
          geo: ctx.profile.location,
          pathwayId,
          metadata: { channel, self_send: true },
        });
      }

      return {
        ok: true,
        pathway_id: pathwayId,
        status,
        channel,
        intro_id: intro?.introId || null,
        intro_status: intro?.status || null,
        status_line: ctx.lastPathwayStatusLine,
        reminder:
          channel === 'trailblaize_ops_intro'
            ? 'Teammate intro queued. The other person has not been texted.'
            : 'Member-owned channel recorded. Scout did not send to the other person.',
      };
    }

    case 'propose_intro': {
      const id = asString(input.id);
      if (!id) return { error: 'id_required', status: 400 };
      const hit = ctx.introducibleHits.get(id);
      if (!hit) {
        return { error: 'not_introducible_or_unknown', status: 403 };
      }
      if (ctx.rejections.some(r => r.type === 'person' && (r.platform_profile_id === id || r.value.toLowerCase() === hit.name.toLowerCase()))) {
        return { error: 'person_rejected', status: 403 };
      }
      const pathwayId = asString(input.pathway_id) || ctx.lastDraftedPathwayId;
      try {
        const queued = await queueOpsIntro(
          ctx,
          hit,
          asString(input.reason) || hit.reason,
          pathwayId
        );
        return {
          intro_id: queued.introId,
          status: queued.status,
          status_line: ctx.lastProposeStatusLine,
          name: hit.name,
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : 'intro_insert_failed', status: 500 };
      }
    }

    case 'request_visibility': {
      const ids = asStringArray(input.platform_profile_ids) || [];
      if (ids.length === 0) return { error: 'platform_profile_ids_required', status: 400 };
      if (!ctx.dryRun) {
        await ctx.supabase.from('scout_visibility_requests').insert({
          member_id: ctx.profileId,
          platform_profile_ids: ids,
          context: asString(input.context) || null,
          status: 'pending',
        });
      }
      return {
        ok: true,
        count: ids.length,
        reminder: 'Speak in aggregates only. Do not name these people.',
      };
    }

    case 'save_member_context': {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const lookingFor = asString(input.looking_for);
      if (lookingFor) {
        patch.looking_for = lookingFor;
        ctx.profile.looking_for = lookingFor;
        patch.goals = [];
        ctx.profile.goals = [];
      }
      const intentLocation = asString(input.intent_location);
      if (intentLocation && !lookingFor) {
        patch.looking_for = `People in ${intentLocation}`;
        ctx.profile.looking_for = patch.looking_for as string;
        patch.goals = [];
        ctx.profile.goals = [];
      }
      const homeLocation = asString(input.home_location);
      if (homeLocation) {
        patch.location = homeLocation;
        ctx.profile.location = homeLocation;
      }
      const identityFields = ['industry', 'career_interest', 'company', 'job_title', 'hometown', 'notes'] as const;
      for (const f of identityFields) {
        const v = asString(input[f]);
        if (v) {
          patch[f] = v;
          if (f === 'industry') ctx.profile.industry = v;
          else if (f === 'career_interest') ctx.profile.career_interest = v;
        }
      }
      const goals = asStringArray(input.goals);
      if (goals && !lookingFor && !intentLocation) {
        patch.goals = goals;
        ctx.profile.goals = goals;
      }
      if (Object.keys(patch).length <= 1) return { ok: true, updated: [] };
      if (!ctx.dryRun) {
        const { data: row, error: patchErr } = await ctx.supabase
          .from('scout_profiles')
          .update(patch)
          .eq('id', ctx.profileId)
          .select('*')
          .single();
        if (patchErr) {
          console.error('[scout/tools] save_member_context persist failed:', patchErr.message);
        } else if (row) {
          const complete = computeProfileComplete(toDiscoveryProfile(row));
          if (complete !== (row.profile_complete ?? 0)) {
            await ctx.supabase
              .from('scout_profiles')
              .update({ profile_complete: complete })
              .eq('id', ctx.profileId);
          }
        }
      }
      return { ok: true, updated: Object.keys(patch).filter(k => k !== 'updated_at' && k !== 'profile_complete') };
    }

    case 'record_rejection': {
      const type = asString(input.type) as ScoutRejection['type'] | undefined;
      const value = asString(input.value);
      if (!type || !value) return { error: 'type_and_value_required', status: 400 };
      if (!['person', 'criterion', 'action'].includes(type)) {
        return { error: 'invalid_type', status: 400 };
      }
      await persistRejection(ctx, {
        type,
        value,
        platform_profile_id: asString(input.platform_profile_id) || null,
        person_id: asString(input.person_id) || null,
      });

      const declines = (ctx.profile.session_consecutive_declines || 0) + (type === 'action' ? 0 : 1);
      let suppressed = Boolean(ctx.profile.session_offer_suppressed);
      if (type === 'action' || declines >= 2) suppressed = true;
      ctx.profile.session_consecutive_declines = type === 'action' ? ctx.profile.session_consecutive_declines : declines;
      ctx.profile.session_offer_suppressed = suppressed;
      if (!ctx.dryRun) {
        await ctx.supabase
          .from('scout_profiles')
          .update({
            session_consecutive_declines: ctx.profile.session_consecutive_declines,
            session_offer_suppressed: suppressed,
            updated_at: new Date().toISOString(),
          })
          .eq('id', ctx.profileId);
      }
      return { ok: true, type, value, session_offer_suppressed: suppressed };
    }

    case 'save_standing_intent': {
      const description = asString(input.description);
      if (!description) return { error: 'description_required', status: 400 };
      const now = new Date();
      const expires = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
      const row = {
        id: `dry-run-${Date.now()}`,
        description,
        location: asString(input.location) || null,
        industry: asString(input.industry) || null,
        status: 'active',
        expires_at: expires.toISOString(),
        last_confirmed_at: now.toISOString(),
        effective_status: 'active',
      };
      if (!ctx.dryRun) {
        const { data, error } = await ctx.supabase
          .from('scout_standing_intents')
          .insert({
            member_id: ctx.profileId,
            description,
            location: row.location,
            industry: row.industry,
            status: 'active',
            last_confirmed_at: row.last_confirmed_at,
            expires_at: row.expires_at,
          })
          .select('id')
          .single();
        if (error) return { error: error.message, status: 500 };
        row.id = data.id as string;
      }
      ctx.standingIntents.unshift(row);
      return { ok: true, intent: row };
    }

    case 'update_standing_intent': {
      const id = asString(input.id);
      const status = asString(input.status);
      if (!id || !status) return { error: 'id_and_status_required', status: 400 };
      const now = new Date();
      const patch: Record<string, unknown> = { status };
      if (status === 'active') {
        patch.last_confirmed_at = now.toISOString();
        patch.expires_at = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
      }
      const existing = ctx.standingIntents.find(i => i.id === id);
      if (existing) {
        existing.status = status;
        existing.effective_status = status;
        if (typeof patch.expires_at === 'string') existing.expires_at = patch.expires_at;
        if (typeof patch.last_confirmed_at === 'string') existing.last_confirmed_at = patch.last_confirmed_at;
      }
      if (!ctx.dryRun) {
        await ctx.supabase.from('scout_standing_intents').update(patch).eq('id', id).eq('member_id', ctx.profileId);
      }
      return { ok: true, id, status };
    }

    case 'save_relationship_context': {
      const displayName = asString(input.display_name);
      if (!displayName) return { error: 'display_name_required', status: 400 };
      const platformId = asString(input.platform_profile_id) || null;
      const unresolved = !platformId;
      const source = platformId ? 'community' : 'member_mentioned';
      const features: TieFeatures = {
        same_chapter: Boolean(platformId),
        year_overlap: false,
        accepted_intro: false,
        recency_days: 0,
        independent_source_count: 1,
      };
      const tieSources = platformId ? ['shared_space', 'conversation'] : ['conversation'];
      const strength = computeTieStrength(features, tieSources);

      let personId = `dry-run-person-${Date.now()}`;
      if (!ctx.dryRun) {
        let personQuery = ctx.supabase
          .from('scout_people')
          .select('id')
          .eq('member_id', ctx.profileId);
        if (platformId) {
          personQuery = personQuery.eq('platform_profile_id', platformId);
        } else {
          personQuery = personQuery.ilike('display_name', displayName);
        }
        const { data: existingPerson } = await personQuery.maybeSingle();
        if (existingPerson?.id) {
          personId = existingPerson.id as string;
          await ctx.supabase
            .from('scout_people')
            .update({
              display_name: displayName,
              unresolved,
              source,
              matched_platform_profile_id: platformId,
              notes: asString(input.notes) || null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', personId);
        } else {
          const { data, error } = await ctx.supabase
            .from('scout_people')
            .insert({
              member_id: ctx.profileId,
              platform_profile_id: platformId,
              display_name: displayName,
              unresolved,
              source,
              matched_platform_profile_id: platformId,
              notes: asString(input.notes) || null,
            })
            .select('id')
            .single();
          if (error || !data) return { error: error?.message || 'person_insert_failed', status: 500 };
          personId = data.id as string;
        }

        await ctx.supabase.from('scout_relationships').upsert(
          {
            member_id: ctx.profileId,
            person_id: personId,
            how_they_know_each_other: asString(input.how_they_know_each_other) || null,
            last_context: asString(input.last_context) || null,
            tie_sources: tieSources,
            tie_features: features,
            tie_strength: strength,
            created_from: 'conversation',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'member_id,person_id' }
        );
      }

      return {
        ok: true,
        person_id: personId,
        unresolved,
        display_name: displayName,
        source,
        evidence: platformId ? ['shared_space', 'member_stated'] : ['member_stated'],
        do_not_introduce: unresolved,
      };
    }

    case 'get_relationships': {
      if (ctx.dryRun) return { relationships: [] };
      const { data } = await ctx.supabase
        .from('scout_relationships')
        .select(
          'id, how_they_know_each_other, last_context, open_thread, tie_features, tie_strength, person:person_id(id, display_name, unresolved, platform_profile_id, source)'
        )
        .eq('member_id', ctx.profileId)
        .limit(50);
      const relationships = (data || []).filter(row => {
        const person = row.person as { source?: string; unresolved?: boolean } | null;
        if (!person) return false;
        if (person.source === 'phone_contact' && person.unresolved) return false;
        return true;
      });
      return { relationships, note: 'Conversation relationships only. Address book is never listed.' };
    }

    case 'report_outcome': {
      const outcome = asString(input.outcome) as OutcomeKind | undefined;
      if (!outcome || !['meeting', 'mentorship', 'referral', 'internship'].includes(outcome)) {
        return { error: 'invalid_outcome', status: 400 };
      }
      const pathwayId = asString(input.pathway_id) || ctx.lastDraftedPathwayId;
      if (!ctx.dryRun) {
        await emitActivationEvent({
          memberId: ctx.profileId,
          type: 'outcome_reported',
          communityId: ctx.profile.platform_chapter_id,
          industry: ctx.profile.industry,
          geo: ctx.profile.location,
          pathwayId,
          outcome,
        });
      }
      return { ok: true, outcome, pathway_id: pathwayId || null };
    }

    case 'reset_working_session': {
      ctx.sessionReset = true;
      ctx.profile.session_offer_suppressed = false;
      ctx.profile.session_consecutive_declines = 0;
      if (!ctx.dryRun) {
        await ctx.supabase
          .from('scout_profiles')
          .update({
            session_offer_suppressed: false,
            session_consecutive_declines: 0,
            updated_at: new Date().toISOString(),
          })
          .eq('id', ctx.profileId);
      }
      return { ok: true, rejections_persist: true };
    }

    case 'send_reply': {
      const message = asString(input.message);
      if (!message) return { error: 'message_required', status: 400 };
      ctx.sendReplyMessage = message;
      return { ok: true, queued: true };
    }

    default:
      return { error: `unknown_tool:${name}`, status: 400 };
  }
}
