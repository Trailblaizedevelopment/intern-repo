/**
 * Local verification of conversational agent fixes.
 * Run: npx tsx scripts/verify-scout-agent.ts
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

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(parseAgentEvent("What's up scout", 'reply').type === 'USER_CHAT', 'greeting');
assert(
  parseAgentEvent(
    'Nothing much, actually looking to see what my friends are up to',
    'reply'
  ).type === 'USER_ASKED_WHO',
  'friends browse → ask who'
);
assert(parseAgentEvent('I just told you', 'reply').type === 'USER_META_REPAIR', 'told you → repair');
assert(
  parseAgentEvent("That's all you have to say?", 'reply').type === 'USER_META_REPAIR',
  'thats all → repair'
);

let session = sessionFromProfileRow({});
let tr = transitionAgent(session, parseAgentEvent("What's up scout", 'reply'), {
  matchReady: true,
  candidates: cands,
  generateType: 'reply',
});
assert(tr.instructionKey === 'chat', 'greeting → chat');

tr = transitionAgent(
  tr.session,
  parseAgentEvent('Nothing much, actually looking to see what my friends are up to', 'reply'),
  { matchReady: true, candidates: cands, generateType: 'reply' }
);
assert(tr.toState === 'offer', 'friends → offer');
assert(tr.injectCard?.name === 'Phillip Oliver', 'offers someone');

tr = transitionAgent(tr.session, parseAgentEvent('I just told you', 'reply'), {
  matchReady: true,
  candidates: cands,
  generateType: 'reply',
});
assert(tr.instructionKey === 'meta_repair', 'repair');
assert(tr.injectMode === 'offer' || tr.injectCard != null, 'repair advances with a card');

console.log('verify-scout-agent: all assertions passed');
