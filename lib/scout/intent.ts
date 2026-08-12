/**
 * Classify the latest inbound user message so Scout answers the question
 * instead of re-dumping the match list every turn.
 */

export type ScoutReplyIntent =
  | 'ask_matches'
  | 'ask_about_person'
  | 'meta_repeat'
  | 'discovery'
  | 'other';

export interface ReplyIntentResult {
  intent: ScoutReplyIntent;
  /** First name or partial name if ask_about_person */
  personQuery: string | null;
}

const MATCH_ASK =
  /\b(who else|anyone else|more people|other people|other guys|network|matches?|connect me|intros?|in texas|in dallas|in houston|in austin)\b/i;

const META_REPEAT =
  /\b(why do you keep|stop repeating|you keep (on )?repeat|same (thing|message)|already (said|told)|repeating)\b/i;

const ABOUT_PERSON =
  /\b(?:tell me more about|what about|who is|who's|what does|where (?:is|does)|more on|info on)\s+([a-z][a-z'-]{1,30})\b/i;

const ABOUT_PERSON_SHORT =
  /\b(?:about)\s+([a-z][a-z'-]{1,30})\??$/i;

export function classifyReplyIntent(latestInbound: string | null | undefined): ReplyIntentResult {
  const text = (latestInbound || '').trim();
  if (!text) return { intent: 'other', personQuery: null };

  if (META_REPEAT.test(text)) {
    return { intent: 'meta_repeat', personQuery: null };
  }

  const about = text.match(ABOUT_PERSON) || text.match(ABOUT_PERSON_SHORT);
  if (about?.[1]) {
    const name = about[1].toLowerCase();
    // Ignore generic nouns that look like the capture group
    if (!['him', 'her', 'them', 'this', 'that', 'someone', 'anyone', 'people', 'guys'].includes(name)) {
      return { intent: 'ask_about_person', personQuery: about[1] };
    }
  }

  if (MATCH_ASK.test(text)) {
    return { intent: 'ask_matches', personQuery: null };
  }

  // Short questions that aren't clearly match-seeking → discovery/other
  if (/\?$/.test(text) || text.split(/\s+/).length <= 12) {
    return { intent: 'discovery', personQuery: null };
  }

  return { intent: 'other', personQuery: null };
}

export function findCandidateByNameQuery<T extends { name: string }>(
  candidates: T[],
  query: string | null
): T | null {
  if (!query) return null;
  const q = query.toLowerCase();
  const exact = candidates.find(c => {
    const parts = c.name.toLowerCase().split(/\s+/);
    return parts.some(p => p.replace(/[^a-z]/g, '') === q.replace(/[^a-z]/g, ''));
  });
  if (exact) return exact;
  return candidates.find(c => c.name.toLowerCase().includes(q)) || null;
}
