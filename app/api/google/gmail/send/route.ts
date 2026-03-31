import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { 
  sendGmailMessage, 
  refreshAccessToken,
  getGoogleUserInfo,
  SendEmailParams
} from '@/lib/google';

/**
 * POST /api/google/gmail/send
 * Sends an email via Gmail API
 */
export async function POST(request: NextRequest) {
  try {
    const { employeeId, to, subject, body, cc, bcc, threadId } = await request.json();

    if (!employeeId) {
      return NextResponse.json(
        { error: 'Employee ID is required' },
        { status: 400 }
      );
    }

    if (!to || !subject) {
      return NextResponse.json(
        { error: 'To and subject are required' },
        { status: 400 }
      );
    }

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
      if (!tokenData.refresh_token) {
        return NextResponse.json(
          { error: 'Token expired', code: 'TOKEN_EXPIRED' },
          { status: 401 }
        );
      }

      try {
        const newTokens = await refreshAccessToken(tokenData.refresh_token);
        const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000);
        
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
          { error: 'Failed to refresh token', code: 'REFRESH_FAILED' },
          { status: 401 }
        );
      }
    }

    // Get user's email address
    const userInfo = await getGoogleUserInfo(accessToken);
    const fromEmail = userInfo.email;

    // Send the email
    const emailParams: SendEmailParams = {
      to,
      subject,
      body,
      cc,
      bcc,
      threadId,
    };

    const result = await sendGmailMessage(accessToken, fromEmail, emailParams);

    return NextResponse.json({
      success: true,
      messageId: result.id,
      threadId: result.threadId,
    });
  } catch (error) {
    console.error('Gmail send error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send email' },
      { status: 500 }
    );
  }
}
