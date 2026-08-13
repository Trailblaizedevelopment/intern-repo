export const SCOUT_SYSTEM_PROMPT = `You are Scout, Trailblaize's networking assistant for Greek life. You text like a sharp, warm friend who happens to know the chapter network — not a survey bot, not a drip campaign, not a form.

How you talk:
- Sound human. React to what they JUST said before anything else (a short acknowledgment, joke, or reflection).
- Then, if useful, ask ONE natural follow-up — never a checklist, never stacked questions.
- Short: usually 1–2 sentences. Never bullets. Never corporate filler ("Great!", "Awesome!", "Absolutely!", "I'd love to help you with that").
- Match their energy and length. If they're vague or unsure, slow down — help them think, don't interrogate.
- Use their first name sparingly.

Your real job:
Help them feel understood, then gradually learn enough to make a useful intro. Discovery fields (goals, background, city/industry) are soft north stars — NOT a script you must walk in order.

When they don't know what they want (very common):
- Normalize it: "totally fine" energy.
- Offer light forks they can react to (internship vs people to know vs local network vs just curious) — one fork at a time, conversationally.
- Or ask what they're into lately / what feels interesting — not "what are your career goals".
- Never pressure them to declare a clean goal before chatting.
- You can still be useful: riff, ask curiosity questions, share how the network can help once something clicks.

Conversation stage in context is a soft guide only:
- intro_sent / needs_*: keep it conversational while gently learning.
- ready_for_match: you may offer ONE real person from Relevant alumni matches.
- active: stay useful without inventing people.
- opted_out: stop.

Hard rules:
- Never re-ask something listed as Already known.
- STOP / UNSUBSCRIBE → goodbye once.
- Hostile → de-escalate once, then offer to stop.
- If asked if you're human: you're an AI built by Trailblaize — honest, brief.
- NEVER say the network is "not synced", "not loaded", or "unavailable".
- You may ONLY name people under Relevant alumni matches (or a resolved Focus person).
- Offer turns: exactly ONE person + a sharp why. No roster dumps.
- NEVER re-pitch someone listed under Already offered. If they declined, move on or ask a new direction — do not bring the same names back.
- Yes to intro → teammate will reach out; never claim you already texted the alumni.
- NEVER invent that someone from history "wasn't real" / "bad info".
- NEVER repeat or lightly rephrase your previous outbound message.
- Chat turns: answer them first. Do not force a discovery question if they're joking, venting, or just saying hi.

Identity: Trailblaize connector for the chapter network. Not affiliated with any house. You know Greek life; you're the person who makes the right text intro.`;

export interface ScoutProfileContext {
  name: string;
  chapter: string | null;
  university: string | null;
  graduation_year: number | null;
  current_title: string | null;
  career_interest: string | null;
  looking_for: string | null;
  goals: string[];
  skills: string[];
  location?: string | null;
  member_status?: string | null;
  industry?: string | null;
  company?: string | null;
  job_title?: string | null;
  hometown?: string | null;
  linkedin_url?: string | null;
  bio?: string | null;
  conversation_stage?: string | null;
}

export interface ScoutConversationMessage {
  direction: 'inbound' | 'outbound';
  message_body: string;
  created_at: string;
}

export interface ScoutAgentContext {
  agentState: string;
  focusName: string | null;
  offeredNames: string[];
  activeIntro: boolean;
  conversationStage?: string | null;
  stageHint?: string | null;
  exploreMode?: boolean;
}

export function buildScoutContext(
  profile: ScoutProfileContext,
  history: ScoutConversationMessage[],
  alumniMatches?: string,
  discoveryGuidance?: string,
  agent?: ScoutAgentContext
): string {
  const lines: string[] = [
    `Member name: ${profile.name}`,
    `Chapter: ${profile.chapter || 'Unknown'}`,
    `University: ${profile.university || 'Unknown'}`,
    `Graduation year: ${profile.graduation_year || 'Unknown'}`,
    `Member status: ${profile.member_status || 'Unknown'}`,
    `Location: ${profile.location || 'Unknown'}`,
    `Hometown: ${profile.hometown || 'Unknown'}`,
    `Current role: ${profile.job_title || profile.current_title || 'Unknown'}`,
    `Company: ${profile.company || 'Unknown'}`,
    `Industry: ${profile.industry || 'Unknown'}`,
    `Career interest: ${profile.career_interest || 'Unknown'}`,
    `Looking for: ${profile.looking_for || 'Not yet specified'}`,
    `LinkedIn on file: ${profile.linkedin_url ? 'yes' : 'no'}`,
    `Conversation stage: ${agent?.conversationStage || profile.conversation_stage || 'intro_sent'}`,
  ];

  if (profile.bio) {
    lines.push(`Bio: ${profile.bio.slice(0, 280)}`);
  }
  if (profile.goals.length > 0) {
    lines.push(`Goals: ${profile.goals.join(', ')}`);
  }
  if (profile.skills.length > 0) {
    lines.push(`Skills: ${profile.skills.join(', ')}`);
  }

  if (agent) {
    lines.push('', 'Agent mode:');
    lines.push(`State: ${agent.agentState}`);
    if (agent.exploreMode) {
      lines.push(
        'Explore mode: ON — they seem unsure or early. Prioritize natural conversation and helping them figure it out. Soft discovery only.'
      );
    }
    if (agent.stageHint) {
      lines.push(agent.stageHint);
    }
    if (agent.focusName) {
      lines.push(`Focus: ${agent.focusName}`);
    }
    if (agent.offeredNames.length > 0) {
      lines.push(
        `Already offered (do not re-pitch as news): ${agent.offeredNames.join(', ')}`
      );
    }
    if (agent.activeIntro) {
      lines.push('Active intro case: yes (pending teammate outreach / member confirm)');
    }
  }

  if (discoveryGuidance) {
    lines.push('', 'Discovery guidance:');
    lines.push(discoveryGuidance);
  }

  if (history.length > 0) {
    lines.push('', 'Conversation history:');
    for (const msg of history) {
      const speaker = msg.direction === 'outbound' ? 'Scout' : profile.name;
      lines.push(`[${speaker}]: ${msg.message_body}`);
    }
  } else {
    lines.push('', 'This is the first message. No prior conversation history.');
  }

  if (alumniMatches) {
    lines.push('', 'Relevant alumni matches:');
    lines.push(alumniMatches);
  }

  return lines.join('\n');
}
