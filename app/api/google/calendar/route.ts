// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { fetchCalendarEvents, refreshAccessToken } from '@/lib/google';

/**
 * GET /api/google/calendar
 * Fetches calendar events for the authenticated user
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const employeeId = searchParams.get('employee_id');
  const days = parseInt(searchParams.get('days') || '7');
  const maxResults = parseInt(searchParams.get('max') || '10');

  if (!employeeId) {
    return NextResponse.json(
      { error: 'Employee ID is required' },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();

    // Get tokens from database
    const { data: tokenData, error: tokenError } = await supabase
      .from('google_oauth_tokens')
      .select('*')
      .eq('employee_id', employeeId)
      .single();

    if (tokenError || !tokenData) {
      return NextResponse.json(
        { error: 'Google account not connected', code: 'NOT_CONNECTED' },
        { status: 401 }
      );
    }

    let accessToken = tokenData.access_token;

    // Check if token is expired
    const expiresAt = new Date(tokenData.expires_at);
    if (expiresAt <= new Date()) {
      // Refresh the token
      if (!tokenData.refresh_token) {
        return NextResponse.json(
          { error: 'Token expired and no refresh token available', code: 'TOKEN_EXPIRED' },
          { status: 401 }
        );
      }

      try {
        const newTokens = await refreshAccessToken(tokenData.refresh_token);
        const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000);
        
        // Update tokens in database
        await supabase
          .from('google_oauth_tokens')
          .update({
            access_token: newTokens.access_token,
            expires_at: newExpiresAt.toISOString(),
          })
          .eq('employee_id', employeeId);

        accessToken = newTokens.access_token;
      } catch (refreshError) {
        console.error('Failed to refresh token:', refreshError);
        return NextResponse.json(
          { error: 'Failed to refresh token. Please reconnect your Google account.', code: 'REFRESH_FAILED' },
          { status: 401 }
        );
      }
    }

    // Calculate time range
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    // Fetch calendar events
    const events = await fetchCalendarEvents(accessToken, timeMin, timeMax, maxResults);

    return NextResponse.json({
      events: events.items || [],
      summary: events.summary,
    });
  } catch (error) {
    console.error('Calendar API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch calendar events' },
      { status: 500 }
    );
  }
}
