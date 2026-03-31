import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { exchangeCodeForTokens } from '@/lib/google';

/**
 * GET /api/google/callback
 * Handles the OAuth callback from Google after user authorization
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Handle user denial or errors
  if (error) {
    console.error('Google OAuth error:', error);
    return NextResponse.redirect(
      new URL('/workspace?google_error=access_denied', request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/workspace?google_error=missing_params', request.url)
    );
  }

  try {
    // Decode state to get employee ID
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { employeeId } = stateData;

    if (!employeeId) {
      throw new Error('Missing employee ID in state');
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Create Supabase admin client to bypass RLS
    const supabase = getSupabaseAdmin();

    // Upsert tokens in database
    const { error: dbError } = await supabase
      .from('google_oauth_tokens')
      .upsert({
        employee_id: employeeId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: tokens.token_type,
        scope: tokens.scope,
        expires_at: expiresAt.toISOString(),
      }, {
        onConflict: 'employee_id',
      });

    if (dbError) {
      console.error('Failed to save tokens:', dbError);
      throw new Error('Failed to save tokens');
    }

    // Redirect back to workspace with success indicator
    return NextResponse.redirect(
      new URL('/workspace?google_connected=true', request.url)
    );
  } catch (err) {
    console.error('OAuth callback error:', err);
    return NextResponse.redirect(
      new URL('/workspace?google_error=callback_failed', request.url)
    );
  }
}
