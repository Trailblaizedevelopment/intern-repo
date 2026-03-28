import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendEnvelope } from '@/lib/docusign';
import { generateContractPdf, getPriceTier } from '@/lib/generateContract';

/**
 * POST /api/chapters/[id]/send-contract
 *
 * Body: {
 *   recipientEmail: string,       // DocuSign envelope recipient (signer 1)
 *   recipientName: string,        // Signer 1 display name
 *   memberCount: number,          // Used to calculate monthly price via tier table
 *   chapterLegalName: string,     // Full legal name embedded in contract document
 *   effectiveDate?: string,       // Optional M/D/YY — defaults to today
 * }
 *
 * Generates a PDF contract, sends it via DocuSign with two-signer routing
 * (customer → Owen countersign), and updates the chapter record.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: chapterId } = await params;

  let body: {
    recipientEmail: string;
    recipientName: string;
    memberCount: number;
    chapterLegalName: string;
    effectiveDate?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { recipientEmail, recipientName, memberCount, chapterLegalName, effectiveDate } = body;

  if (!recipientEmail || !recipientName || !memberCount || !chapterLegalName) {
    return NextResponse.json(
      {
        error: 'Missing required fields: recipientEmail, recipientName, memberCount, chapterLegalName',
      },
      { status: 400 },
    );
  }

  if (typeof memberCount !== 'number' || memberCount < 1) {
    return NextResponse.json(
      { error: 'memberCount must be a positive number' },
      { status: 400 },
    );
  }

  // ── Calculate monthly price from tier table ──────────────────────────────
  const monthlyPrice = getPriceTier(memberCount);

  // ── Resolve effective date ───────────────────────────────────────────────
  let resolvedDate = effectiveDate;
  if (!resolvedDate) {
    const now = new Date();
    // Format as M/D/YY
    const yy = String(now.getFullYear()).slice(-2);
    resolvedDate = `${now.getMonth() + 1}/${now.getDate()}/${yy}`;
  }

  // ── Generate PDF ─────────────────────────────────────────────────────────
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await generateContractPdf({
      effectiveDate: resolvedDate,
      customerName: chapterLegalName,
      monthlyPrice,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[send-contract] generateContractPdf failed:', message);
    return NextResponse.json({ error: `PDF generation failed: ${message}` }, { status: 500 });
  }

  // ── Convert to base64 ────────────────────────────────────────────────────
  const pdfBase64 = Buffer.from(pdfBytes).toString('base64');
  const pdfFileName = `Trailblaize_SaaS_Agreement_${chapterLegalName.replace(/\s+/g, '_').slice(0, 60)}.pdf`;

  // ── Send via DocuSign ────────────────────────────────────────────────────
  let envelopeId: string;
  try {
    envelopeId = await sendEnvelope(chapterId, recipientEmail, recipientName, pdfBase64, pdfFileName);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[send-contract] sendEnvelope failed:', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // ── Update chapter record ────────────────────────────────────────────────
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
      member_count: memberCount,
      mrr: monthlyPrice,
    })
    .eq('id', chapterId);

  if (updateError) {
    console.error('[send-contract] DB update failed:', updateError);
    // Don't fail — envelope was already sent
  }

  return NextResponse.json({
    success: true,
    envelopeId,
    monthlyPrice,
    pdfFileName,
  });
}
