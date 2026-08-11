import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  SCOUT_SYSTEM_PROMPT,
  buildScoutContext,
  ScoutProfileContext,
  ScoutConversationMessage,
} from '@/lib/scout/prompt';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 256;

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { data: null, error: { message: 'ANTHROPIC_API_KEY not configured', code: 'CONFIG' } },
        { status: 500 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { profile_id, type } = body as { profile_id: string; type: 'open' | 'reply' };

    if (!profile_id || !type) {
      return NextResponse.json(
        { data: null, error: { message: 'profile_id and type are required', code: 'MISSING_FIELDS' } },
        { status: 400 }
      );
    }

    // Load profile
    const { data: profile, error: profileErr } = await supabase
      .from('scout_profiles')
      .select('*')
      .eq('id', profile_id)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json(
        { data: null, error: { message: 'Profile not found', code: 'NOT_FOUND' } },
        { status: 404 }
      );
    }

    // Load conversation history (last 30 messages for context)
    const { data: messages } = await supabase
      .from('scout_conversations')
      .select('direction, message_body, created_at')
      .eq('profile_id', profile_id)
      .order('created_at', { ascending: true })
      .limit(30);

    const history: ScoutConversationMessage[] = (messages || []).map(m => ({
      direction: m.direction as 'inbound' | 'outbound',
      message_body: m.message_body,
      created_at: m.created_at,
    }));

    // Check 2-unanswered-followup rule
    if (type === 'reply') {
      let unansweredCount = 0;
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].direction === 'outbound') {
          unansweredCount++;
        } else {
          break;
        }
      }
      if (unansweredCount >= 2) {
        return NextResponse.json({
          data: { message: null, skipped: true, reason: 'max_unanswered_followups' },
          error: null,
        });
      }
    }

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

    // Call Anthropic Messages API
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SCOUT_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `${userContent}\n\n---\n\n${instruction}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[POST /api/scout/agent/generate] Anthropic error:', res.status, errText);
      return NextResponse.json(
        { data: null, error: { message: `Anthropic API error (${res.status})`, code: 'AI_ERROR' } },
        { status: 502 }
      );
    }

    const aiResponse = await res.json();
    const generatedText = aiResponse.content
      ?.filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('')
      .trim();

    if (!generatedText) {
      return NextResponse.json(
        { data: null, error: { message: 'AI generated empty response', code: 'AI_EMPTY' } },
        { status: 502 }
      );
    }

    return NextResponse.json({ data: { message: generatedText }, error: null });
  } catch (err) {
    console.error('[POST /api/scout/agent/generate] Unexpected error:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
