import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { 
  fetchGmailMessages, 
  fetchGmailMessage, 
  getGmailUnreadCount,
  refreshAccessToken,
  parseGmailHeaders,
  decodeBase64Url
} from '@/lib/google';

interface FormattedEmail {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  fromEmail: string;
  to: string;
  date: string;
  snippet: string;
  body: string;
  isUnread: boolean;
  labels: string[];
}

/**
 * GET /api/google/gmail
 * Fetches Gmail messages for the authenticated user
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const employeeId = searchParams.get('employee_id');
  const maxResults = parseInt(searchParams.get('max') || '20');
  const query = searchParams.get('q') || undefined;
  const labelIds = searchParams.get('labels')?.split(',') || ['INBOX'];

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

    // Fetch message list
    const messageList = await fetchGmailMessages(accessToken, maxResults, labelIds, query);

    // Fetch full details for each message (in parallel)
    const messagesToFetch = (messageList.messages || []).slice(0, Math.min(maxResults, 50));
    const fullMessages = await Promise.all(
      messagesToFetch.map(msg => 
        fetchGmailMessage(accessToken, msg.id, 'full')
          .catch(err => {
            console.error(`Failed to fetch message ${msg.id}:`, err);
            return null;
          })
      )
    );

    // Get unread count
    const unreadCount = await getGmailUnreadCount(accessToken);

    // Format messages for response
    const emails: FormattedEmail[] = fullMessages
      .filter((msg): msg is NonNullable<typeof msg> => msg !== null)
      .map(msg => {
        const headers = parseGmailHeaders(msg.payload?.headers || []);
        
        // Extract body content
        let body = '';
        if (msg.payload?.body?.data) {
          body = decodeBase64Url(msg.payload.body.data);
        } else if (msg.payload?.parts) {
          const textPart = msg.payload.parts.find(p => p.mimeType === 'text/plain');
          const htmlPart = msg.payload.parts.find(p => p.mimeType === 'text/html');
          const part = textPart || htmlPart;
          if (part?.body?.data) {
            body = decodeBase64Url(part.body.data);
          }
        }

        // Parse from header
        const fromHeader = headers['from'] || '';
        const fromMatch = fromHeader.match(/^(.+?)\s*<(.+?)>$/);
        const fromName = fromMatch ? fromMatch[1].replace(/"/g, '') : fromHeader;
        const fromEmail = fromMatch ? fromMatch[2] : fromHeader;

        return {
          id: msg.id,
          threadId: msg.threadId,
          subject: headers['subject'] || '(No subject)',
          from: fromName,
          fromEmail: fromEmail,
          to: headers['to'] || '',
          date: headers['date'] || new Date(parseInt(msg.internalDate)).toISOString(),
          snippet: msg.snippet,
          body: body.substring(0, 500), // Truncate for preview
          isUnread: msg.labelIds?.includes('UNREAD') || false,
          labels: msg.labelIds || [],
        };
      });

    return NextResponse.json({
      emails,
      unreadCount,
      totalEstimate: messageList.resultSizeEstimate,
    });
  } catch (error) {
    console.error('Gmail API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch emails' },
      { status: 500 }
    );
  }
}
