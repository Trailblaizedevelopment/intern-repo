/**
 * Local verification of conversational agent fixes.
 * Run: node --import tsx scripts/verify-scout-agent.ts
 */
import { parseAgentEvent } from '../lib/scout/intent';
import { sessionFromProfileRow, transitionAgent } from '../lib/scout/agent';
import type { ScoutCandidate } from '../lib/scout/match';

const cands: ScoutCandidate[] = [
  {
    platform_id: '11111111-1111-1111-1111-111111111111',
    name: 'Phillip Oliver',
    score: 24,
    geoHit: true,
    role: 'Accounting',
    major: null,
    location: 'Dallas, Texas',
    hometown: 'Tupelo',
    member_status: 'alumni',
    bio: null,
    linkedin_url: null,
    grad_year: 2023,
    reason: 'geo',
  },
  {
    platform_id: '22222222-2222-2222-2222-222222222222',
    name: 'Walter Frank McCreight',
    score: 18,
    geoHit: true,
    role: 'Finance',
    major: null,
    location: 'Fort Worth, TX',
    hometown: 'Jackson, MS',
    member_status: 'alumni',
    bio: null,
    linkedin_url: null,
    grad_year: 1977,
    reason: 'geo',
  },
  {
    platform_id: '33333333-3333-3333-3333-333333333333',
    name: 'Jack Zook, III',
    score: 18,
    geoHit: true,
    role: null,
    major: null,
    location: 'Austin, TX',
    hometown: null,
    member_status: 'alumni',
    bio: null,
    linkedin_url: null,
    grad_year: 2021,
    reason: 'geo',
  },
];

const knownNames = cands.map(c => c.name);

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(parseAgentEvent("What's up scout", 'reply').type === 'USER_CHAT', 'greeting → chat');
assert(
  parseAgentEvent('Who else is in my Texas network', 'reply').type === 'USER_ASKED_WHO',
  'who else → ask who'
);
assert(
  parseAgentEvent('Jack zook is in the network though', 'reply', { knownNames }).type ===
    'USER_ASKED_ABOUT',
  'correction → about'
);
assert(
  parseAgentEvent('Jack zook is in the next work though', 'reply', { knownNames }).personQuery
    ?.toLowerCase()
    .includes('jack') ||
    parseAgentEvent('Jack zook is in the next work though', 'reply', { knownNames }).type ===
      'USER_ASKED_ABOUT',
  'typo network still finds Jack via knownNames'
);

let session = sessionFromProfileRow({});
let tr = transitionAgent(session, parseAgentEvent("What's up scout", 'reply'), {
  matchReady: true,
  candidates: cands,
  generateType: 'reply',
});
assert(tr.instructionKey === 'chat', 'greeting stays chat');
assert(tr.injectMode !== 'offer', 'greeting does not offer');

tr = transitionAgent(tr.session, parseAgentEvent('Who else is in my Texas network', 'reply'), {
  matchReady: true,
  candidates: cands,
  generateType: 'reply',
});
assert(tr.toState === 'offer', 'who else → offer');
assert(tr.instructionKey === 'offer', 'offer instruction');
assert(tr.injectCard?.name === 'Phillip Oliver', 'first offer Phillip');

session = tr.session;
tr = transitionAgent(
  session,
  parseAgentEvent("What's up scout", 'reply'),
  { matchReady: true, candidates: cands, generateType: 'reply' }
);
assert(tr.instructionKey === 'chat', 'small talk in offer → chat not re-offer');
assert(tr.toState === 'offer', 'state stays offer');

tr = transitionAgent(
  session,
  parseAgentEvent('Jack is in the network', 'reply', { knownNames }),
  { matchReady: true, candidates: cands, generateType: 'reply' }
);
assert(tr.toState === 'deep_dive', 'Jack correction → deep_dive');
assert(tr.injectCard?.name.toLowerCase().includes('jack'), 'focus Jack');
assert(tr.instructionKey === 'deep_dive', 'deep_dive instruction');

console.log('verify-scout-agent: all assertions passed');
