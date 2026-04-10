import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Generate a new onboarding token for a chapter
export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { data: null, error: { message: 'Database not connected', code: 'DB_ERROR' } },
      { status: 500 }
    );
  }

  try {
    const { chapter_id, regenerate } = await request.json();

    if (!chapter_id) {
      return NextResponse.json(
        { data: null, error: { message: 'Chapter ID is required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    // Generate a unique token
    const token = generateToken();

    // Update the chapter with the new token
    const { data, error } = await supabase
      .from('chapters')
      .update({
        onboarding_token: token,
        onboarding_token_created_at: new Date().toISOString(),
        // Clear submitted_at if regenerating
        ...(regenerate && { onboarding_submitted_at: null }),
      })
      .eq('id', chapter_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { data: null, error: { message: error.message, code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: { token, chapter: data }, error: null });
  } catch (err) {
    console.error('Error generating token:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Failed to generate token', code: 'SERVER_ERROR' } },
      { status: 500 }
    );
  }
}

// Validate a token and get chapter info
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { data: null, error: { message: 'Database not connected', code: 'DB_ERROR' } },
      { status: 500 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { data: null, error: { message: 'Token is required', code: 'VALIDATION_ERROR' } },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('chapters')
      .select('id, chapter_name, school, fraternity, onboarding_submitted_at')
      .eq('onboarding_token', token)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { data: null, error: { message: 'Invalid or expired token', code: 'INVALID_TOKEN' } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: {
        chapter_id: data.id,
        chapter_name: data.chapter_name,
        school: data.school,
        fraternity: data.fraternity,
        already_submitted: !!data.onboarding_submitted_at,
      },
      error: null,
    });
  } catch (err) {
    console.error('Error validating token:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Failed to validate token', code: 'SERVER_ERROR' } },
      { status: 500 }
    );
  }
}

// Generate a random alphanumeric token
function generateToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 12; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}
