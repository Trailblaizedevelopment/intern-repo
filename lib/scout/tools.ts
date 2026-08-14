export const SCOUT_TOOLS = [
  {
    name: 'search_network',
    description:
      'Search the member chapter network. Server excludes rejected people and rejected criteria. Non-introducible hits have no name/PII. Only tier 1 (same chapter) is available; other tier_scope values are ignored.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text intent (city, industry, role, etc.)' },
        location: { type: 'string' },
        industry: { type: 'string' },
        tier_scope: {
          type: 'array',
          items: { type: 'integer' },
          description: 'Requested tiers 1-4. Only 1 is implemented.',
        },
        limit: { type: 'integer' },
      },
    },
  },
  {
    name: 'get_person',
    description:
      'Fetch details for an introducible person whose id appeared in this turn’s search_network results.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Platform profile id from search_network' },
      },
      required: ['id'],
    },
  },
  {
    name: 'propose_intro',
    description:
      'Queue a human-gated intro (status suggested). Does not text anyone. Rejected if the person/criterion is rejected or not introducible.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Platform profile id' },
        reason: { type: 'string', description: 'Why this intro fits' },
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
      'Patch this member’s scout profile (location, looking_for, industry, etc.). Replace fields on a pivot — do not merge conflicting geos.',
    input_schema: {
      type: 'object',
      properties: {
        looking_for: { type: 'string' },
        location: { type: 'string' },
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
    description: 'List this member’s captured relationships. Does not search the platform network.',
    input_schema: { type: 'object', properties: {} },
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
      'The only outbound SMS candidate. Keep it short (~1–3 sentences, under 500 characters). If you do not call this, nothing is sent.',
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
