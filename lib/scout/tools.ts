export const SCOUT_TOOLS = [
  {
    name: 'search_network',
    description:
      'Search the member Trailblaize community (same space/chapter). Returns pathways with source, verified evidence, and suggested action channel — not a people-search dump. Server excludes rejected people and rejected criteria. Non-introducible hits have no name/PII. Only tier 1 (same community) is available. Phone-contact matches are included only when already authorized; never ask for the address book over SMS.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text intent (city, industry, role, etc.)' },
        location: { type: 'string', description: 'Search geo for this query (not the member home city)' },
        industry: { type: 'string' },
        min_grad_year: { type: 'integer' },
        max_grad_year: { type: 'integer' },
        tier_scope: {
          type: 'array',
          items: { type: 'integer' },
          description: 'Requested tiers 1-4. Only 1 is implemented.',
        },
        limit: { type: 'integer', description: 'Max pathways. Prefer a few credible paths (default 8, max 12).' },
      },
    },
  },
  {
    name: 'get_person',
    description:
      'Fetch pathway details for an introducible person whose id appeared in search_network this conversation.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Platform profile id from search_network' },
      },
      required: ['id'],
    },
  },
  {
    name: 'draft_pathway',
    description:
      'Store a recommended pathway (person, evidence, channel, draft). Does not contact anyone. Member must still confirm. Use after they are interested in a search hit.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Platform profile id from search_network' },
        draft_text: { type: 'string', description: 'Short outreach draft for the member to review' },
        channel: {
          type: 'string',
          description: 'Override suggested channel. Unwired channels are rejected.',
        },
      },
      required: ['id', 'draft_text'],
    },
  },
  {
    name: 'confirm_pathway',
    description:
      'Record that the member reviewed the draft (approved, edited, or declined). For trailblaize_ops_intro, queues a teammate intro. Does not text the other person.',
    input_schema: {
      type: 'object',
      properties: {
        pathway_id: { type: 'string' },
        decision: { type: 'string', enum: ['approved', 'edited', 'declined'] },
        draft_text: { type: 'string', description: 'Required when decision=edited' },
      },
      required: ['pathway_id', 'decision'],
    },
  },
  {
    name: 'propose_intro',
    description:
      'Queue a human-gated teammate intro (status suggested) AFTER confirm_pathway when the channel is trailblaize_ops_intro. Does not text anyone.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Platform profile id' },
        reason: { type: 'string', description: 'Why this intro fits' },
        pathway_id: { type: 'string', description: 'Optional pathway this intro belongs to' },
      },
      required: ['id'],
    },
  },
  {
    name: 'request_visibility',
    description:
      'Log a request to ask non-introducible people to opt in. Scout may only speak about them in aggregates.',
    input_schema: {
      type: 'object',
      properties: {
        platform_profile_ids: { type: 'array', items: { type: 'string' } },
        context: { type: 'string' },
      },
      required: ['platform_profile_ids'],
    },
  },
  {
    name: 'save_member_context',
    description:
      'Patch member facts. looking_for / intent_location are search intent (replaces goals). home_location / hometown are where they live — never write a networking city into home_location.',
    input_schema: {
      type: 'object',
      properties: {
        looking_for: { type: 'string', description: 'What they want from the network. Replaces prior looking_for and clears goals.' },
        intent_location: { type: 'string', description: 'City/region they want intros in. Does not change home location.' },
        home_location: { type: 'string', description: 'Where they live now.' },
        industry: { type: 'string' },
        career_interest: { type: 'string' },
        company: { type: 'string' },
        job_title: { type: 'string' },
        hometown: { type: 'string' },
        goals: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' },
      },
    },
  },
  {
    name: 'record_rejection',
    description:
      'Persist a rejection. type=person: do not offer that person again. type=criterion: exclude that geo/industry from search. type=action: stop offering this session.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['person', 'criterion', 'action'] },
        value: { type: 'string', description: 'Name, criterion (e.g. Texas), or action label' },
        platform_profile_id: { type: 'string' },
        person_id: { type: 'string' },
      },
      required: ['type', 'value'],
    },
  },
  {
    name: 'save_standing_intent',
    description:
      'Save an unmet ask to check later (90-day confirm window). Use when the pool is empty or they want you to keep an eye out.',
    input_schema: {
      type: 'object',
      properties: {
        description: { type: 'string' },
        location: { type: 'string' },
        industry: { type: 'string' },
      },
      required: ['description'],
    },
  },
  {
    name: 'update_standing_intent',
    description:
      'Update a standing intent status. Re-confirming an expired/unconfirmed intent sets it active again for 90 days.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string', enum: ['active', 'fulfilled', 'expired', 'unconfirmed'] },
      },
      required: ['id', 'status'],
    },
  },
  {
    name: 'save_relationship_context',
    description:
      'Capture a person the member mentioned (friend, coworker). Unmatched names are stored unresolved. Do not search or introduce them unless they appear as introducible search hits.',
    input_schema: {
      type: 'object',
      properties: {
        display_name: { type: 'string' },
        how_they_know_each_other: { type: 'string' },
        notes: { type: 'string' },
        last_context: { type: 'string' },
        platform_profile_id: { type: 'string' },
      },
      required: ['display_name'],
    },
  },
  {
    name: 'get_relationships',
    description:
      'List this member’s captured relationships from conversation. Does not search the network or dump a phone book.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'report_outcome',
    description:
      'Record a self-reported outcome after outreach (meeting, mentorship, referral, internship). Stores an aggregate event only — not message contents.',
    input_schema: {
      type: 'object',
      properties: {
        pathway_id: { type: 'string' },
        outcome: { type: 'string', enum: ['meeting', 'mentorship', 'referral', 'internship'] },
      },
      required: ['outcome'],
    },
  },
  {
    name: 'reset_working_session',
    description:
      'Clear session offer-suppression and consecutive declines (start over). Rejections persist.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'send_reply',
    description:
      'Required on every open/reply turn: conversation SMS to the member only — not outreach to a third party. Keep it short (~1–3 sentences, under 500 characters). If you do not call this, nothing is sent.',
    input_schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
      required: ['message'],
    },
  },
] as const;

export type ScoutToolName = (typeof SCOUT_TOOLS)[number]['name'];
