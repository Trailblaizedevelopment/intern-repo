import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const DOCUSIGN_HMAC_KEY = process.env.DOCUSIGN_HMAC_KEY!;

/**
 * Verifies the DocuSign HMAC-SHA256 signature.
 * DocuSign signs the raw request body using the HMAC key.
 */
function verifyHmacSignature(body: string, signature: string): boolean {
  if (!DOCUSIGN_HMAC_KEY) {
    console.warn('[docusign-webhook] DOCUSIGN_HMAC_KEY not set — skipping verification');
    return true;
  }
  const expected = createHmac('sha256', DOCUSIGN_HMAC_KEY)
    .update(body, 'utf8')
    .digest('base64');
  return expected === signature;
}

/**
 * POST /api/webhooks/docusign
 * DocuSign Connect webhook handler (REST v2.1 JSON format).
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('X-DocuSign-Signature-1') || '';

  if (!verifyHmacSignature(rawBody, signature)) {
    console.error('[docusign-webhook] HMAC verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const event = payload.event as string | undefined;
  const data = payload.data as Record<string, unknown> | undefined;
  const envelopeSummary = data?.envelopeSummary as Record<string, unknown> | undefined;

  if (!event || !envelopeSummary) {
    return NextResponse.json({ ok: true, message: 'Ignored: no event/envelopeSummary' });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });
  }

  if (event === 'envelope-completed') {
    // Extract chapter_id from customFields.textCustomFields
    const customFields = envelopeSummary.customFields as Record<string, unknown> | undefined;
    const textCustomFields = customFields?.textCustomFields as Array<Record<string, string>> | undefined;

    const chapterIdField = textCustomFields?.find(f => f.name === 'chapter_id');
    const chapterId = chapterIdField?.value;

    if (!chapterId) {
      console.warn('[docusign-webhook] envelope-completed but no chapter_id in customFields');
      return NextResponse.json({ ok: true, message: 'No chapter_id found' });
    }

    const { error } = await supabase
      .from('chapters')
      .update({
        contract_signed_at: new Date().toISOString(),
        contract_status: 'signed',
      })
      .eq('id', chapterId);

    if (error) {
      console.error('[docusign-webhook] Failed to update chapter (signed):', error);
    } else {
      console.log(`[docusign-webhook] Chapter ${chapterId} contract signed`);
    }
  } else if (event === 'envelope-declined') {
    const envelopeId = envelopeSummary.envelopeId as string | undefined;
    if (envelopeId) {
      await supabase
        .from('chapters')
        .update({ contract_status: 'declined' })
        .eq('docusign_envelope_id', envelopeId);
    }
  } else if (event === 'envelope-voided') {
    const envelopeId = envelopeSummary.envelopeId as string | undefined;
    if (envelopeId) {
      await supabase
        .from('chapters')
        .update({ contract_status: 'voided' })
        .eq('docusign_envelope_id', envelopeId);
    }
  }

  return NextResponse.json({ ok: true });
}
