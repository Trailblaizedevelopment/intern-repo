import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendMessage, createChat } from '@/lib/linq';
import {
  SCOUT_SYSTEM_PROMPT,
  buildScoutContext,
  ScoutProfileContext,
  ScoutConversationMessage,
} from '@/lib/scout/prompt';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

function normalizeToE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (phone.startsWith('+')) return phone;
  return `+${digits}`;
}

async function generateScoutMessage(profileId: string, type: 'open' | 'reply'): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data: profile } = await supabase
    .from('scout_profiles')
    .select('*')
    .eq('id', profileId)
    .single();

  if (!profile) return null;

  const { data: messages } = await supabase
    .from('scout_conversations')
    .select('direction, message_body, created_at')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: true })
    .limit(30);

  const history: ScoutConversationMessage[] = (messages || []).map(m => ({
    direction: m.direction as 'inbound' | 'outbound',
    message_body: m.message_body,
    created_at: m.created_at,
  }));

  const profileContext: ScoutProfileContext = {
    name: profile.name,
    chapter: profile.chapter,
    university: profile.university,
    graduation_year: profile.graduation_year,
    current_title: profile.current_title,
    career_interest: profile.career_interest,
    looking_for: profile.looking_for,
    goals: Array.isArray(profile.goals) ? profile.goals : [],
    skills: Array.isArray(profile.skills) ? profile.skills : [],
  };

  const userContent = buildScoutContext(profileContext, history);
  const instruction = type === 'open'
    ? 'Generate your opening message to this person. This is your first text to them — make it warm, low-stakes, and brief. 1-2 sentences max.'
    : 'Generate your next reply in this conversation. Stay in character. 1-2 sentences max.';

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 256,
      system: SCOUT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `${userContent}\n\n---\n\n${instruction}` }],
    }),
  });

  if (!res.ok) return null;

  const aiResponse = await res.json();
  return aiResponse.content
    ?.filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('')
    .trim() || null;
}

export { generateScoutMessage };

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { chat_id, to_phone, from_phone, auto_generate, profile_id } = body;
    let { message } = body;

    if (!from_phone) {
      return NextResponse.json(
        { data: null, error: { message: 'from_phone is required', code: 'MISSING_FIELDS' } },
        { status: 400 }
      );
    }

    // Auto-generate message via Scout agent if requested
    if (auto_generate && profile_id) {
      const type = message ? 'reply' : 'open';
      const generated = await generateScoutMessage(profile_id, type);
      if (!generated) {
        return NextResponse.json(
          { data: null, error: { message: 'Failed to generate message', code: 'AI_ERROR' } },
          { status: 502 }
        );
      }
      message = generated;
    }

    if (!message) {
      return NextResponse.json(
        { data: null, error: { message: 'message is required (or set auto_generate: true)', code: 'MISSING_FIELDS' } },
        { status: 400 }
      );
    }

    if (!chat_id && !to_phone) {
      return NextResponse.json(
        { data: null, error: { message: 'Either chat_id or to_phone is required', code: 'MISSING_FIELDS' } },
        { status: 400 }
      );
    }

    let linqChatId = chat_id;
    let recipientPhone = to_phone ? normalizeToE164(to_phone) : to_phone;

    if (chat_id) {
      await sendMessage(chat_id, message, from_phone);
    } else {
      const chat = await createChat(from_phone, recipientPhone, message);
      linqChatId = chat.id;
    }

    // Resolve profile_id from phone number
    if (!recipientPhone && linqChatId) {
      const { data: existingMsg } = await supabase
        .from('scout_conversations')
        .select('phone_number')
        .eq('linq_chat_id', linqChatId)
        .limit(1)
        .single();
      recipientPhone = existingMsg?.phone_number || to_phone;
    }

    let resolvedProfileId: string | null = profile_id || null;
    if (!resolvedProfileId && recipientPhone) {
      const { data: profile } = await supabase
        .from('scout_profiles')
        .select('id')
        .eq('phone_number', recipientPhone)
        .single();
      resolvedProfileId = profile?.id || null;
    }

    // Insert outbound record
    const { data: convo, error: convoErr } = await supabase
      .from('scout_conversations')
      .insert({
        phone_number: recipientPhone || '',
        linq_line: from_phone,
        linq_chat_id: linqChatId,
        direction: 'outbound',
        message_body: message,
        profile_id: resolvedProfileId,
        read: true,
      })
      .select()
      .single();

    if (convoErr) {
      console.error('[POST /api/scout/send] DB insert error:', convoErr.message);
      return NextResponse.json(
        { data: null, error: { message: convoErr.message, code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    // Update last_contact on profile
    if (resolvedProfileId) {
      await supabase
        .from('scout_profiles')
        .update({ last_contact: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', resolvedProfileId);
    }

    return NextResponse.json({ data: convo, error: null }, { status: 201 });
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : 'Internal server error';
    console.error('[POST /api/scout/send] Error:', errMessage);
    return NextResponse.json(
      { data: null, error: { message: errMessage, code: 'SEND_FAILED' } },
      { status: 500 }
    );
  }
}
