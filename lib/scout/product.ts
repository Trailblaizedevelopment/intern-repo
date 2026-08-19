import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const PERSON_SOURCES = ['trailblaize_community', 'phone_contact', 'linkedin'] as const;
export type PersonSource = (typeof PERSON_SOURCES)[number];

export const PEOPLE_ROW_SOURCES = [
  'community',
  'phone_contact',
  'linkedin',
  'member_mentioned',
] as const;
export type PeopleRowSource = (typeof PEOPLE_ROW_SOURCES)[number];

export const EVIDENCE_KINDS = [
  'shared_space',
  'shared_chapter',
  'phone_match',
  'member_stated',
  'linkedin_url',
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const ACTION_CHANNELS = [
  'trailblaize_ops_intro',
  'sms',
  'phone',
  'linkedin_linkout',
  'native_share',
  'trailblaize_message',
  'trailblaize_connection',
] as const;
export type ActionChannel = (typeof ACTION_CHANNELS)[number];

export const PATHWAY_STATUSES = [
  'drafted',
  'member_approved',
  'member_edited',
  'executed',
  'declined',
  'expired',
] as const;
export type PathwayStatus = (typeof PATHWAY_STATUSES)[number];

export const ACTIVATION_EVENT_TYPES = [
  'scout_opened',
  'repeat_turn',
  'pathway_drafted',
  'intro_requested',
  'intro_accepted',
  'invite_suggested',
  'outcome_reported',
] as const;
export type ActivationEventType = (typeof ACTIVATION_EVENT_TYPES)[number];

export const OUTCOME_KINDS = ['meeting', 'mentorship', 'referral', 'internship'] as const;
export type OutcomeKind = (typeof OUTCOME_KINDS)[number];

export interface PathwayEvidence {
  kind: EvidenceKind;
  label: string;
}

export interface ChannelCapability {
  channel: ActionChannel;
  available: boolean;
  note: string;
}

export interface ScoutCapabilities {
  linkedin_graph_available: boolean;
  linkedin_send_available: boolean;
  trailblaize_dm_available: boolean;
  phone_contacts_ingest_available: boolean;
}

export const DEFAULT_CAPABILITIES: ScoutCapabilities = {
  linkedin_graph_available: false,
  linkedin_send_available: false,
  trailblaize_dm_available: false,
  phone_contacts_ingest_available: true,
};

export const UNWIRED_CHANNELS: ActionChannel[] = [
  'trailblaize_message',
  'trailblaize_connection',
  'native_share',
];

export function channelCapabilities(caps: ScoutCapabilities): ChannelCapability[] {
  return [
    {
      channel: 'trailblaize_ops_intro',
      available: true,
      note: 'Teammate-facilitated intro after the member reviews a draft.',
    },
    {
      channel: 'sms',
      available: true,
      note: 'Only when a permissioned phone-contact match exists.',
    },
    {
      channel: 'phone',
      available: true,
      note: 'Only when a permissioned phone-contact match exists.',
    },
    {
      channel: 'linkedin_linkout',
      available: true,
      note: 'Open the public profile with a reviewed draft. No LinkedIn send.',
    },
    {
      channel: 'native_share',
      available: false,
      note: 'Not available on SMS.',
    },
    {
      channel: 'trailblaize_message',
      available: caps.trailblaize_dm_available,
      note: caps.trailblaize_dm_available
        ? 'Send in Trailblaize.'
        : 'Not available. Do not claim you sent a Trailblaize DM.',
    },
    {
      channel: 'trailblaize_connection',
      available: false,
      note: 'Not available. Do not claim a connection request was sent.',
    },
  ];
}

export function isChannelAvailable(channel: ActionChannel, caps: ScoutCapabilities): boolean {
  if (channel === 'trailblaize_message') return caps.trailblaize_dm_available;
  if (channel === 'trailblaize_connection' || channel === 'native_share') return false;
  return true;
}

export function suggestActionChannel(opts: {
  hasContactMatch: boolean;
  reachableSms: boolean;
  hasCommunityPath: boolean;
  linkedinUrl: string | null;
}): ActionChannel {
  if (opts.hasContactMatch && opts.reachableSms) return 'sms';
  if (opts.hasContactMatch) return 'phone';
  if (opts.hasCommunityPath) return 'trailblaize_ops_intro';
  if (opts.linkedinUrl) return 'linkedin_linkout';
  return 'trailblaize_ops_intro';
}

export function evidenceSummary(evidence: PathwayEvidence[]): string {
  if (evidence.length === 0) return 'shared community';
  return evidence.map(e => e.label).join('; ');
}

export function sourceToPeopleRow(source: PersonSource): PeopleRowSource {
  if (source === 'trailblaize_community') return 'community';
  return source;
}

export async function loadCapabilities(): Promise<ScoutCapabilities> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ...DEFAULT_CAPABILITIES };
  const { data, error } = await supabase
    .from('scout_settings')
    .select(
      'linkedin_graph_available, linkedin_send_available, trailblaize_dm_available, phone_contacts_ingest_available'
    )
    .eq('id', '00000000-0000-0000-0000-000000000001')
    .maybeSingle();
  if (error || !data) return { ...DEFAULT_CAPABILITIES };
  return {
    linkedin_graph_available: data.linkedin_graph_available ?? false,
    linkedin_send_available: data.linkedin_send_available ?? false,
    trailblaize_dm_available: data.trailblaize_dm_available ?? false,
    phone_contacts_ingest_available: data.phone_contacts_ingest_available ?? true,
  };
}

export function capabilitiesPromptBlock(caps: ScoutCapabilities): string {
  const lines = [
    'Capability flags (do not promise anything marked unavailable):',
    `- LinkedIn graph: ${caps.linkedin_graph_available ? 'available' : 'unavailable'}`,
    `- LinkedIn send: ${caps.linkedin_send_available ? 'available' : 'unavailable'}`,
    `- Trailblaize DMs / connection requests: ${caps.trailblaize_dm_available ? 'available' : 'unavailable'}`,
    `- Phone-contact ingest: ${caps.phone_contacts_ingest_available ? 'API ready (may have zero matches)' : 'unavailable'}`,
    'send_reply is conversation with the member. Outreach to a third party requires draft_pathway then confirm_pathway.',
  ];
  return lines.join('\n');
}
