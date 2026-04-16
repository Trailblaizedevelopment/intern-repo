import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const DOCUSIGN_INTEGRATION_KEY = process.env.DOCUSIGN_INTEGRATION_KEY!;
const DOCUSIGN_CLIENT_SECRET = process.env.DOCUSIGN_CLIENT_SECRET!;
const DOCUSIGN_REDIRECT_URI = process.env.DOCUSIGN_REDIRECT_URI?.trim() || 'https://trailblaize.space/api/auth/docusign/callback';
const DOCUSIGN_AUTH_URL = 'https://account.docusign.com';

/**
 * GET /api/auth/docusign/callback?code=<code>&state=<chapter_id>
 * Exchanges the auth code for tokens, stores them in Supabase,
 * then redirects back to the chapter's CS dashboard page.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const chapterId = searchParams.get('state') || '';

  if (!code) {
    return NextResponse.json({ error: 'Missing authorization code' }, { status: 400 });
  }

  const credentials = Buffer.from(`${DOCUSIGN_INTEGRATION_KEY}:${DOCUSIGN_CLIENT_SECRET}`).toString('base64');

  const tokenRes = await fetch(`${DOCUSIGN_AUTH_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: DOCUSIGN_REDIRECT_URI,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    const debugInfo = {
      status: tokenRes.status,
      body,
      integrationKeyPrefix: DOCUSIGN_INTEGRATION_KEY?.slice(0, 8),
      secretKeyPresent: !!DOCUSIGN_CLIENT_SECRET,
      secretKeyLength: DOCUSIGN_CLIENT_SECRET?.length,
      redirectUri: DOCUSIGN_REDIRECT_URI,
      authUrl: DOCUSIGN_AUTH_URL,
      codeLength: code?.length,
    };
    console.error('[DocuSign callback] Token exchange failed:', debugInfo);
    return NextResponse.json({ error: 'Token exchange failed', details: body, debug: debugInfo }, { status: 502 });
  }

  const tokens = await tokenRes.json();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });
  }

  // Upsert — we only ever need one active token row (delete old ones first)
  await supabase.from('docusign_tokens').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  const { error: insertError } = await supabase.from('docusign_tokens').insert({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expires_at: expiresAt,
  });

  if (insertError) {
    console.error('[DocuSign callback] Failed to store tokens:', insertError);
    return NextResponse.json({ error: 'Failed to store tokens' }, { status: 500 });
  }

  // Redirect back to the chapter's dashboard (or general CS page)
  const redirectUrl = chapterId
    ? `/nucleus/customer-success/${chapterId}`
    : '/nucleus/customer-success';

  return NextResponse.redirect(new URL(redirectUrl, req.url));
}
