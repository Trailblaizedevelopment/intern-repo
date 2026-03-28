import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEnvelope } from '@/lib/docusign';

/**
 * POST /api/chapters/[id]/send-contract
 * Body: { recipientEmail, recipientName, pdfBase64, pdfFileName }
 *
 * Sends a DocuSign envelope and updates the chapter record with
 * contract_sent_at and docusign_envelope_id.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: chapterId } = await params;

  let body: {
    recipientEmail: string;
    recipientName: string;
    pdfBase64: string;
    pdfFileName: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { recipientEmail, recipientName, pdfBase64, pdfFileName } = body;

  if (!recipientEmail || !recipientName || !pdfBase64 || !pdfFileName) {
    return NextResponse.json(
      { error: 'Missing required fields: recipientEmail, recipientName, pdfBase64, pdfFileName' },
      { status: 400 },
    );
  }

  // Strip data URI prefix if present (e.g. "data:application/pdf;base64,...")
  const cleanBase64 = pdfBase64.includes(',') ? pdfBase64.split(',')[1] : pdfBase64;

  let envelopeId: string;
  try {
    envelopeId = await sendEnvelope(chapterId, recipientEmail, recipientName, cleanBase64, pdfFileName);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[send-contract] sendEnvelope failed:', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'DB unavailable' }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from('chapters')
    .update({
      contract_sent_at: new Date().toISOString(),
      docusign_envelope_id: envelopeId,
      contract_status: 'sent',
    })
    .eq('id', chapterId);

  if (updateError) {
    console.error('[send-contract] DB update failed:', updateError);
    // Don't fail the request — envelope was already sent
  }

  return NextResponse.json({ envelopeId, success: true });
}
