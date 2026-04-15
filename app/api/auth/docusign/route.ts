import { NextRequest, NextResponse } from 'next/server';

const DOCUSIGN_INTEGRATION_KEY = process.env.DOCUSIGN_INTEGRATION_KEY!;
const DOCUSIGN_REDIRECT_URI = process.env.DOCUSIGN_REDIRECT_URI?.trim() || 'https://trailblaize.space/api/auth/docusign/callback';
const DOCUSIGN_AUTH_URL = 'https://account.docusign.com';

/**
 * GET /api/auth/docusign?chapter_id=<id>
 * Redirects the user to DocuSign's OAuth authorization page.
 * The chapter_id is passed as the `state` param so we can track
 * which chapter triggered the auth flow.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const chapterId = searchParams.get('chapter_id') || '';

  const params = new URLSearchParams({
    response_type: 'code',
    scope: 'signature',
    client_id: DOCUSIGN_INTEGRATION_KEY,
    redirect_uri: DOCUSIGN_REDIRECT_URI,
    state: chapterId,
  });

  const authUrl = `${DOCUSIGN_AUTH_URL}/oauth/auth?${params.toString()}`;
  return NextResponse.redirect(authUrl);
}
