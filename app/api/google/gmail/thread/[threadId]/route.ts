import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  fetchGmailThread,
  refreshAccessToken,
  parseGmailHeaders,
  decodeBase64Url,
} from '@/lib/google';

interface FormattedThreadMessage {
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
 * GET /api/google/gmail/thread/[threadId]
 * Fetches full thread with all messages for chat-style view
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const employeeId = searchParams.get('employee_id');

  if (!employeeId || !threadId) {
    return NextResponse.json(
      { error: 'Employee ID and thread ID are required' },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();

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

    const expiresAt = new Date(tokenData.expires_at);
    if (expiresAt <= new Date() && tokenData.refresh_token) {
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
    }

    const thread = await fetchGmailThread(accessToken, threadId, 'full');

    const messages: FormattedThreadMessage[] = (thread.messages || [])
      .sort((a, b) => parseInt(a.internalDate) - parseInt(b.internalDate))
      .map((msg) => {
        const headers = parseGmailHeaders(msg.payload?.headers || []);

        let body = '';
        if (msg.payload?.body?.data) {
          body = decodeBase64Url(msg.payload.body.data);
        } else if (msg.payload?.parts) {
          const textPart = msg.payload.parts.find((p) => p.mimeType === 'text/plain');
          const htmlPart = msg.payload.parts.find((p) => p.mimeType === 'text/html');
          const part = textPart || htmlPart;
          if (part?.body?.data) {
            body = decodeBase64Url(part.body.data);
          }
        }

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
          body,
          isUnread: msg.labelIds?.includes('UNREAD') || false,
          labels: msg.labelIds || [],
        };
      });

    return NextResponse.json({
      threadId,
      messages,
      subject: messages[0]?.subject || '(No subject)',
    });
  } catch (error) {
    console.error('Gmail thread API error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch thread',
      },
      { status: 500 }
    );
  }
}
