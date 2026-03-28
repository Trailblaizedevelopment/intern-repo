import { getSupabaseAdmin } from '@/lib/supabase-admin';

const DOCUSIGN_ACCOUNT_ID = process.env.DOCUSIGN_ACCOUNT_ID!;
const DOCUSIGN_INTEGRATION_KEY = process.env.DOCUSIGN_INTEGRATION_KEY!;
const DOCUSIGN_CLIENT_SECRET = process.env.DOCUSIGN_CLIENT_SECRET!;
const DOCUSIGN_BASE_URL = 'https://na4.docusign.net';
const DOCUSIGN_AUTH_URL = 'https://account.docusign.com';

/**
 * Returns a valid DocuSign access token.
 * Checks the docusign_tokens table; refreshes if expired.
 */
export async function getAccessToken(): Promise<string> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('Supabase admin client unavailable');

  // Fetch the most recent token row
  const { data, error } = await supabase
    .from('docusign_tokens')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error('No DocuSign tokens found. Please complete OAuth first.');
  }

  const now = new Date();
  const expiresAt = new Date(data.token_expires_at);

  // If token is still valid (with 60s buffer), return it
  if (expiresAt.getTime() - now.getTime() > 60_000) {
    return data.access_token;
  }

  // Token expired — refresh it
  const credentials = Buffer.from(`${DOCUSIGN_INTEGRATION_KEY}:${DOCUSIGN_CLIENT_SECRET}`).toString('base64');

  const res = await fetch(`${DOCUSIGN_AUTH_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: data.refresh_token,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DocuSign token refresh failed: ${res.status} ${body}`);
  }

  const tokens = await res.json();
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  await supabase
    .from('docusign_tokens')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || data.refresh_token,
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', data.id);

  return tokens.access_token;
}

/**
 * Creates and sends a DocuSign envelope immediately.
 * Embeds chapter_id as a hidden custom field.
 * Returns the envelopeId.
 */
export async function sendEnvelope(
  chapterId: string,
  recipientEmail: string,
  recipientName: string,
  pdfBase64: string,
  pdfFileName: string,
): Promise<string> {
  const accessToken = await getAccessToken();

  const envelopeBody = {
    emailSubject: `Contract for ${pdfFileName}`,
    documents: [
      {
        documentBase64: pdfBase64,
        name: pdfFileName,
        fileExtension: 'pdf',
        documentId: '1',
      },
    ],
    recipients: {
      signers: [
        {
          email: recipientEmail,
          name: recipientName,
          recipientId: '1',
          routingOrder: '1',
          tabs: {
            signHereTabs: [
              {
                // Place signature tab at the bottom of page 1
                documentId: '1',
                pageNumber: '1',
                xPosition: '100',
                yPosition: '700',
              },
            ],
          },
        },
      ],
    },
    customFields: {
      textCustomFields: [
        {
          name: 'chapter_id',
          value: chapterId,
          show: 'false',
          required: 'false',
        },
      ],
    },
    status: 'sent',
  };

  const url = `${DOCUSIGN_BASE_URL}/restapi/v2.1/accounts/${DOCUSIGN_ACCOUNT_ID}/envelopes`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(envelopeBody),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DocuSign envelope creation failed: ${res.status} ${body}`);
  }

  const result = await res.json();
  return result.envelopeId as string;
}
