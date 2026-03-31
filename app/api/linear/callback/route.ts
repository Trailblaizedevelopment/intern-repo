// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { exchangeLinearCodeForTokens, getLinearCurrentUser } from '@/lib/linear';

/**
 * GET /api/linear/callback
 * Handles the OAuth callback from Linear after user authorization
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Handle user denial or errors
  if (error) {
    console.error('Linear OAuth error:', error);
    return NextResponse.redirect(
      new URL('/workspace/projects?linear_error=access_denied', request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/workspace/projects?linear_error=missing_params', request.url)
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
    const tokens = await exchangeLinearCodeForTokens(code);

    // Get Linear user info
    const linearUser = await getLinearCurrentUser(tokens.access_token);

    // Calculate expiration time (Linear tokens typically don't expire, but set a far future date)
    const expiresAt = tokens.expires_in 
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year from now

    // Create Supabase admin client to bypass RLS
    const supabase = getSupabaseAdmin();

    // Upsert tokens in database
    const { error: dbError } = await supabase
      .from('linear_oauth_tokens')
      .upsert({
        employee_id: employeeId,
        access_token: tokens.access_token,
        token_type: tokens.token_type,
        scope: tokens.scope,
        linear_user_id: linearUser.id,
        linear_user_email: linearUser.email,
        linear_user_name: linearUser.name,
        expires_at: expiresAt.toISOString(),
      }, {
        onConflict: 'employee_id',
      });

    if (dbError) {
      console.error('Failed to save Linear tokens:', dbError);
      throw new Error('Failed to save tokens');
    }

    // Redirect back to workspace projects with success indicator
    return NextResponse.redirect(
      new URL('/workspace/projects?linear_connected=true', request.url)
    );
  } catch (err) {
    console.error('Linear OAuth callback error:', err);
    return NextResponse.redirect(
      new URL('/workspace/projects?linear_error=callback_failed', request.url)
    );
  }
}
