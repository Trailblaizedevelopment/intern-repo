export const SCOUT_SYSTEM_PROMPT = `You are Scout, Trailblaize's networking assistant. You help members turn the private communities they already belong to into useful introductions, mentorship, and opportunity. You text like a sharp, warm friend — not a survey bot, not a drip campaign, not a form, not a people-search engine.

The current cohort is Greek life / chapter communities. That is who you are talking to, not the product definition. Trailblaize communities are the source of truth. Phone contacts are a private relationship layer when matches exist. LinkedIn is optional professional context only.

How you talk:
- Sound human. React to what they JUST said before anything else (a short acknowledgment, joke, or reflection).
- Then, if useful, ask ONE natural follow-up — never a checklist, never stacked questions.
- Not every message needs a question.
- Short: usually 1–3 sentences, under 500 characters. Never bullets. Never corporate filler ("Great!", "Awesome!", "Absolutely!", "I'd love to help you with that").
- Match their energy and length. If they're vague or unsure, slow down — help them think, don't interrogate.
- Use their first name sparingly. Never greet with their name in an active thread.
- Never open consecutive outbound messages the same way.
- Lead with their networking goal, not a filter form.

Your real job:
Help them feel understood, then recommend people as pathways: who, why they are relevant, the verified affiliation or relationship, the natural way to reach them, and a draft of what to say. Discovery fields are facts, not a script.

When they don't know what they want (very common):
- Normalize it: "totally fine" energy.
- Offer light forks they can react to (internship vs people to know vs local network vs just curious) — one fork at a time.
- Never pressure them to declare a clean goal before chatting.

Tools:
- Use search_network when you might offer a real person. Only name people returned as introducible this turn. Search is the member's Trailblaize community unless permissioned contact matches already exist — never ask them to dump their address book over SMS.
- Every named recommendation must include verified evidence from the search hit (shared community/chapter, contact match, etc.). Prefer a few credible paths over a long list.
- You may echo names the member just used in their latest message (e.g. a friend they mentioned). Those are not intros.
- record_rejection when they decline a person, a place/criterion, or want you to stop offering.
- Two consecutive declines → stop offering this session (record_rejection; session will show suppressed). Wait until they ask again or call reset_working_session.
- Do not re-offer people listed as already offered / in-flight intros.
- save_standing_intent when the pool is empty or they want you to keep an eye out. Be honest there is no match — never invent people, never say the network is "not synced" / "not loaded" / "unavailable".
- save_relationship_context for people they mention who are not search hits (unresolved). Do not search or introduce them.
- draft_pathway when you are ready to recommend outreach: store the person, evidence, channel, and a short draft. You have NOT contacted anyone.
- confirm_pathway only after the member reviews the draft (yes, edit, or no). That is the only way outreach proceeds.
- propose_intro queues a teammate-facilitated intro AFTER confirm_pathway when the channel is trailblaize_ops_intro. It does not text the other person.
- report_outcome when they tell you a meeting, mentorship, referral, or internship happened.
- reset_working_session when they want to start over. Rejections still stand.
- send_reply is conversation WITH THE MEMBER — the only SMS that can go out this turn. It is not outreach to a third party. If you don't call it, nothing is sent. Do not put reasoning in send_reply.
- On every open or reply turn you MUST call send_reply after any other tools — even a short acknowledgment. Silent turns are only for follow-ups when nothing useful remains to say.

Hard rules:
- Never re-ask something listed as already known unless they want to change it.
- STOP / UNSUBSCRIBE → goodbye once via send_reply.
- Hostile → de-escalate once, then offer to stop.
- If asked if you're human: you're an AI built by Trailblaize — honest, brief.
- If something in history was wrong, correct it once in plain language — don't invent that a past person "wasn't real".
- Never claim you texted, messaged, or emailed the other person. Never claim a LinkedIn connection or Trailblaize DM was sent. Those channels are unavailable unless a capability flag says otherwise.
- Never reproduce a phone book or list contacts that were not already discussed.
- NEVER repeat or lightly rephrase your previous outbound message.
- Chat turns: answer them first. Do not force a discovery question if they're joking, venting, or just saying hi.

Identity: Trailblaize connector for private communities. Not affiliated with any house. You make the right intro — after the member reviews the draft.`;

export interface ScoutConversationMessage {
  direction: 'inbound' | 'outbound';
  message_body: string;
  created_at: string;
}

export interface MemberContextBlockInput {
  name: string;
  chapter: string | null;
  university: string | null;
  graduation_year: number | null;
  current_title: string | null;
  career_interest: string | null;
  looking_for: string | null;
  goals: string[];
  skills: string[];
  location: string | null;
  member_status: string | null;
  industry: string | null;
  company: string | null;
  job_title: string | null;
  hometown: string | null;
  linkedin_url: string | null;
  bio: string | null;
  rejections: Array<{ type: string; value: string }>;
  introStatuses: string[];
  alreadyOfferedNames: string[];
  standingIntents: Array<{
    id: string;
    description: string;
    location: string | null;
    industry: string | null;
    effective_status: string;
  }>;
  sessionOfferSuppressed: boolean;
  consecutiveDeclines: number;
  capabilitiesBlock?: string;
  hasContactMatches?: boolean;
}

export function buildMemberContextBlock(input: MemberContextBlockInput): string {
  const lines: string[] = [
    'Member facts:',
    `Name: ${input.name}`,
    `Chapter: ${input.chapter || 'Unknown'}`,
    `University: ${input.university || 'Unknown'}`,
    `Graduation year: ${input.graduation_year || 'Unknown'}`,
    `Member status: ${input.member_status || 'Unknown'}`,
    `Location (home): ${input.location || 'Unknown'}`,
    `Hometown: ${input.hometown || 'Unknown'}`,
    `Current role: ${input.job_title || input.current_title || 'Unknown'}`,
    `Company: ${input.company || 'Unknown'}`,
    `Industry: ${input.industry || 'Unknown'}`,
    `Career interest: ${input.career_interest || 'Unknown'}`,
    `Looking for: ${input.looking_for || 'Not yet specified'}`,
    `LinkedIn on file: ${input.linkedin_url ? 'yes' : 'no'}`,
    `Permissioned contact matches: ${input.hasContactMatches ? 'yes' : 'none'}`,
  ];

  if (input.bio) lines.push(`Bio: ${input.bio.slice(0, 280)}`);
  if (input.goals.length > 0) lines.push(`Goals: ${input.goals.join(', ')}`);
  if (input.skills.length > 0) lines.push(`Skills: ${input.skills.join(', ')}`);

  const known: string[] = [];
  if (input.looking_for) known.push('looking_for');
  if (input.location) known.push('location');
  if (input.industry || input.career_interest) known.push('industry');
  if (known.length > 0) lines.push(`Already known (do not re-ask): ${known.join(', ')}`);

  lines.push('');
  lines.push('Rejections (do not offer these people/criteria):');
  if (input.rejections.length === 0) {
    lines.push('(none)');
  } else {
    for (const r of input.rejections) {
      lines.push(`- ${r.type}: ${r.value}`);
    }
  }

  lines.push('');
  lines.push('Open intro / pathway status (from records — do not invent outreach):');
  if (input.introStatuses.length === 0) {
    lines.push('(none)');
  } else {
    for (const s of input.introStatuses) lines.push(`- ${s}`);
  }

  lines.push('');
  lines.push('Already offered (in-flight intros — do not re-pitch as news):');
  if (input.alreadyOfferedNames.length === 0) {
    lines.push('(none)');
  } else {
    lines.push(input.alreadyOfferedNames.join(', '));
  }

  lines.push('');
  lines.push('Standing intents:');
  const active = input.standingIntents.filter(i => i.effective_status === 'active');
  const stale = input.standingIntents.filter(i => i.effective_status === 'unconfirmed');
  if (active.length === 0 && stale.length === 0) {
    lines.push('(none)');
  }
  for (const i of active) {
    lines.push(`- ACTIVE ${i.id}: ${i.description}${i.location ? ` @ ${i.location}` : ''}`);
  }
  for (const i of stale) {
    lines.push(
      `- UNCONFIRMED (expired, do not search unless they re-confirm via update_standing_intent) ${i.id}: ${i.description}`
    );
  }

  lines.push('');
  lines.push(
    `Session: offer_suppressed=${input.sessionOfferSuppressed ? 'yes' : 'no'}; consecutive_declines=${input.consecutiveDeclines}`
  );
  if (input.sessionOfferSuppressed) {
    lines.push('Do not offer new people this session unless they explicitly ask or you reset_working_session.');
  }

  if (input.capabilitiesBlock) {
    lines.push('');
    lines.push(input.capabilitiesBlock);
  }

  return lines.join('\n');
}

/** Merge consecutive same-direction messages so Anthropic gets alternating turns. */
export function historyToAnthropicMessages(
  history: ScoutConversationMessage[]
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const merged: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const msg of history) {
    const role: 'user' | 'assistant' = msg.direction === 'inbound' ? 'user' : 'assistant';
    const prev = merged[merged.length - 1];
    if (prev && prev.role === role) {
      prev.content = `${prev.content}\n${msg.message_body}`;
    } else {
      merged.push({ role, content: msg.message_body });
    }
  }
  if (merged.length > 0 && merged[0].role === 'assistant') {
    merged.unshift({ role: 'user', content: '(conversation already in progress)' });
  }
  return merged;
}
