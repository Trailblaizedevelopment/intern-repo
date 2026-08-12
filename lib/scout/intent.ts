/**
 * Agent events + legacy reply-intent helpers for Scout.
 */

export type ScoutReplyIntent =
  | 'ask_matches'
  | 'ask_about_person'
  | 'meta_repeat'
  | 'discovery'
  | 'other';

export interface ReplyIntentResult {
  intent: ScoutReplyIntent;
  personQuery: string | null;
}

export type AgentEventType =
  | 'USER_SUBSTANCE'
  | 'USER_CLARIFY'
  | 'USER_ASKED_WHO'
  | 'USER_ASKED_ABOUT'
  | 'USER_SAID_YES'
  | 'USER_SAID_NO'
  | 'USER_META_REPAIR'
  | 'USER_STOP'
  | 'FOLLOWUP_TICK'
  | 'OPEN';

export interface AgentEvent {
  type: AgentEventType;
  personQuery: string | null;
}

const MATCH_ASK =
  /\b(who else|anyone else|more people|other people|other guys|network|matches?|connect me|intros?|in texas|in dallas|in houston|in austin)\b/i;

const META_REPEAT =
  /\b(why do you keep|stop repeating|you keep (on )?repeat|same (thing|message)|already (said|told)|repeating)\b/i;

const ABOUT_PERSON =
  /\b(?:tell me more about|what about|who is|who's|what does|where (?:is|does)|more on|info on)\s+([a-z][a-z'-]{1,30})\b/i;

const ABOUT_PERSON_SHORT = /\b(?:about)\s+([a-z][a-z'-]{1,30})\??$/i;

const SAID_YES =
  /^(yes|yeah|yep|yup|sure|ok|okay|do it|go ahead|lets do it|let's do it|sounds good|please|absolutely)\b/i;

const SAID_NO =
  /^(no|nah|nope|pass|skip|not him|not her|not that|someone else|next)\b/i;

const STOP = /^\s*(stop|unsubscribe|opt out)\s*$/i;

const GENERIC_NAMES = new Set([
  'him',
  'her',
  'them',
  'this',
  'that',
  'someone',
  'anyone',
  'people',
  'guys',
]);

export function classifyReplyIntent(latestInbound: string | null | undefined): ReplyIntentResult {
  const event = parseAgentEvent(latestInbound, 'reply');
  switch (event.type) {
    case 'USER_ASKED_WHO':
      return { intent: 'ask_matches', personQuery: null };
    case 'USER_ASKED_ABOUT':
      return { intent: 'ask_about_person', personQuery: event.personQuery };
    case 'USER_META_REPAIR':
      return { intent: 'meta_repeat', personQuery: null };
    case 'USER_CLARIFY':
    case 'USER_SUBSTANCE':
      return { intent: 'discovery', personQuery: null };
    default:
      return { intent: 'other', personQuery: null };
  }
}

export function parseAgentEvent(
  latestInbound: string | null | undefined,
  generateType: 'open' | 'reply' | 'followup'
): AgentEvent {
  if (generateType === 'open') {
    return { type: 'OPEN', personQuery: null };
  }
  if (generateType === 'followup') {
    return { type: 'FOLLOWUP_TICK', personQuery: null };
  }

  const text = (latestInbound || '').trim();
  if (!text) return { type: 'USER_SUBSTANCE', personQuery: null };

  if (STOP.test(text)) {
    return { type: 'USER_STOP', personQuery: null };
  }

  if (META_REPEAT.test(text)) {
    return { type: 'USER_META_REPAIR', personQuery: null };
  }

  const about = text.match(ABOUT_PERSON) || text.match(ABOUT_PERSON_SHORT);
  if (about?.[1]) {
    const name = about[1].toLowerCase();
    if (!GENERIC_NAMES.has(name)) {
      return { type: 'USER_ASKED_ABOUT', personQuery: about[1] };
    }
  }

  if (MATCH_ASK.test(text)) {
    return { type: 'USER_ASKED_WHO', personQuery: null };
  }

  // Short affirm/deny — only meaningful in deep_dive / await_requester_yes (caller gates)
  if (text.split(/\s+/).length <= 6) {
    if (SAID_YES.test(text)) return { type: 'USER_SAID_YES', personQuery: null };
    if (SAID_NO.test(text)) return { type: 'USER_SAID_NO', personQuery: null };
  }

  if (/\?$/.test(text) || text.split(/\s+/).length <= 12) {
    return { type: 'USER_CLARIFY', personQuery: null };
  }

  return { type: 'USER_SUBSTANCE', personQuery: null };
}

export function findCandidateByNameQuery<T extends { name: string }>(
  candidates: T[],
  query: string | null
): T | null {
  if (!query) return null;
  const q = query.toLowerCase().replace(/[^a-z]/g, '');
  const exact = candidates.find(c => {
    const parts = c.name.toLowerCase().split(/\s+/);
    return parts.some(p => p.replace(/[^a-z]/g, '') === q);
  });
  if (exact) return exact;
  return candidates.find(c => c.name.toLowerCase().includes(query.toLowerCase())) || null;
}
