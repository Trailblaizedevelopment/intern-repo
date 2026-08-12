import { NextRequest, NextResponse } from 'next/server';
import { generateScoutMessage } from '@/lib/scout/generate';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { profile_id, type } = body as { profile_id: string; type: 'open' | 'reply' };

    if (!profile_id || !type) {
      return NextResponse.json(
        { data: null, error: { message: 'profile_id and type are required', code: 'MISSING_FIELDS' } },
        { status: 400 }
      );
    }

    if (type !== 'open' && type !== 'reply') {
      return NextResponse.json(
        { data: null, error: { message: 'type must be open or reply', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const result = await generateScoutMessage(profile_id, type);

    if (result.skipped && result.reason === 'max_unanswered_followups') {
      return NextResponse.json({
        data: { message: null, skipped: true, reason: 'max_unanswered_followups' },
        error: null,
      });
    }

    if (result.skipped && result.reason === 'missing_api_key') {
      return NextResponse.json(
        { data: null, error: { message: 'ANTHROPIC_API_KEY not configured', code: 'CONFIG' } },
        { status: 500 }
      );
    }

    if (result.skipped && result.reason === 'db_not_configured') {
      return NextResponse.json(
        { data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } },
        { status: 500 }
      );
    }

    if (result.skipped && result.reason === 'profile_not_found') {
      return NextResponse.json(
        { data: null, error: { message: 'Profile not found', code: 'NOT_FOUND' } },
        { status: 404 }
      );
    }

    if (result.skipped && (result.reason === 'ai_error' || result.reason === 'ai_empty')) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: result.reason === 'ai_empty' ? 'AI generated empty response' : 'Anthropic API error',
            code: result.reason === 'ai_empty' ? 'AI_EMPTY' : 'AI_ERROR',
          },
        },
        { status: 502 }
      );
    }

    if (!result.message) {
      return NextResponse.json({
        data: { message: null, skipped: true, reason: result.reason || 'unknown' },
        error: null,
      });
    }

    return NextResponse.json({
      data: { message: result.message, match_count: result.matchCount ?? 0 },
      error: null,
    });
  } catch (err) {
    console.error('[POST /api/scout/agent/generate] Unexpected error:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
