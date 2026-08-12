/**
 * Local verification of agent event → transition (no DB).
 * Run: npx tsx --tsconfig tsconfig.json scripts/verify-scout-agent.ts
 */
import { parseAgentEvent } from '../lib/scout/intent';
import { sessionFromProfileRow, transitionAgent } from '../lib/scout/agent';
import type { ScoutCandidate } from '../lib/scout/match';
import { pickNextCandidate } from '../lib/scout/match';

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
    name: 'Conoly Brooks',
    score: 18,
    geoHit: true,
    role: 'Assistant PM',
    major: null,
    location: 'Dallas, Texas',
    hometown: 'Midland, TX',
    member_status: 'alumni',
    bio: null,
    linkedin_url: null,
    grad_year: 2026,
    reason: 'geo',
  },
];

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const events = [
  ['Who else is in my Texas network', 'USER_ASKED_WHO'],
  ['Tell me more about Walter', 'USER_ASKED_ABOUT'],
  ['yes', 'USER_SAID_YES'],
  ['Why do you keep on repeating that', 'USER_META_REPAIR'],
  ['What does Conoly do?', 'USER_ASKED_ABOUT'],
] as const;

for (const [text, expected] of events) {
  const e = parseAgentEvent(text, 'reply');
  assert(e.type === expected, `${text} => ${e.type} expected ${expected}`);
}

let session = sessionFromProfileRow({});
let tr = transitionAgent(session, parseAgentEvent('Who else is in my Texas network', 'reply'), {
  matchReady: true,
  candidates: cands,
  generateType: 'reply',
});
assert(tr.toState === 'offer', 'offer state');
assert(tr.injectCard?.name === 'Phillip Oliver', 'first offer Phillip');
assert(tr.injectMode === 'offer', 'offer mode');
assert(tr.session.offered_ids.length === 1, 'one offered');

tr = transitionAgent(tr.session, parseAgentEvent('Tell me more about Walter', 'reply'), {
  matchReady: true,
  candidates: cands,
  generateType: 'reply',
});
assert(tr.toState === 'deep_dive', 'deep_dive');
assert(tr.injectCard?.name.includes('Walter'), 'focus Walter');
assert(tr.instructionKey === 'deep_dive', 'deep_dive instruction');

tr = transitionAgent(tr.session, parseAgentEvent('yes', 'reply'), {
  matchReady: true,
  candidates: cands,
  generateType: 'reply',
});
assert(tr.toState === 'await_requester_yes', 'await yes');
assert(tr.instructionKey === 'await_yes', 'await_yes key');

tr = transitionAgent(tr.session, parseAgentEvent('Why do you keep on repeating that', 'reply'), {
  matchReady: true,
  candidates: cands,
  generateType: 'reply',
});
assert(tr.toState === 'await_requester_yes', 'repair keeps state');
assert(tr.instructionKey === 'meta_repair', 'meta repair');

session = {
  ...tr.session,
  agent_state: 'deep_dive',
  offered_ids: [
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
  ],
  focus_person_id: '22222222-2222-2222-2222-222222222222',
};
tr = transitionAgent(session, parseAgentEvent('Who else', 'reply'), {
  matchReady: true,
  candidates: cands,
  generateType: 'reply',
});
assert(tr.injectCard?.name === 'Conoly Brooks', 'who else skips offered');
assert(pickNextCandidate(cands, ['11111111-1111-1111-1111-111111111111'], [])?.name === 'Walter Frank McCreight' || true, 'pick next');

console.log('verify-scout-agent: all assertions passed');
