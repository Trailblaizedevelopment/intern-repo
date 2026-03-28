import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib';

export interface GenerateContractParams {
  effectiveDate: string;   // e.g. "3/27/26"
  customerName: string;    // e.g. "Alabama Beta Chapter of Sigma Phi Epsilon"
  monthlyPrice: number;    // e.g. 299
}

// ─── Price → words ────────────────────────────────────────────────────────────

const ONES = [
  '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function numberToWords(n: number): string {
  if (n === 0) return 'zero';
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' and ' + numberToWords(n % 100) : '');
  return n.toString();
}

function priceWords(dollars: number): string {
  const cents = 0;
  const dollarWords = numberToWords(dollars);
  const centWords = 'zero';
  return `${dollarWords} dollars and ${centWords} cents ($${dollars}.00)`;
}

function fmtPrice(dollars: number): string {
  return `$${dollars}.00`;
}

// ─── Text layout helpers ───────────────────────────────────────────────────────

const MARGIN_L = 56;
const MARGIN_R = 56;
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 56;
const PAGE_W = 612;
const PAGE_H = 792;
const BODY_W = PAGE_W - MARGIN_L - MARGIN_R;
const FONT_SIZE_BODY = 11;
const FONT_SIZE_TITLE = 14;
const LINE_HEIGHT = FONT_SIZE_BODY * 1.55;

interface DrawContext {
  page: PDFPage;
  font: PDFFont;
  boldFont: PDFFont;
  y: number;
  doc: PDFDocument;
  pages: PDFPage[];
  pageNum: number;
  totalPages: number;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? current + ' ' + word : word;
    const width = font.widthOfTextAtSize(candidate, size);
    if (width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawWrappedText(
  ctx: DrawContext,
  text: string,
  opts: {
    size?: number;
    bold?: boolean;
    indent?: number;
    extraSpacingAfter?: number;
    color?: [number, number, number];
  } = {},
): DrawContext {
  const size = opts.size ?? FONT_SIZE_BODY;
  const font = opts.bold ? ctx.boldFont : ctx.font;
  const indent = opts.indent ?? 0;
  const maxW = BODY_W - indent;
  const lines = wrapText(text, font, size, maxW);
  const textColor = opts.color ? rgb(opts.color[0], opts.color[1], opts.color[2]) : rgb(0, 0, 0);

  let { y, page, pageNum, pages, doc } = ctx;

  for (const line of lines) {
    if (y < MARGIN_BOTTOM + LINE_HEIGHT) {
      // New page
      const newPage = doc.addPage([PAGE_W, PAGE_H]);
      pages.push(newPage);
      pageNum++;
      page = newPage;
      y = PAGE_H - MARGIN_TOP;
    }
    page.drawText(line, {
      x: MARGIN_L + indent,
      y,
      size,
      font,
      color: textColor,
    });
    y -= LINE_HEIGHT;
  }

  y -= (opts.extraSpacingAfter ?? 0);
  return { ...ctx, y, page, pageNum, pages };
}

function drawBlankLine(ctx: DrawContext, lines = 1): DrawContext {
  return { ...ctx, y: ctx.y - LINE_HEIGHT * lines };
}

function drawPageNumber(page: PDFPage, font: PDFFont, num: number, total: number) {
  const text = `Page ${num} of ${total}`;
  const size = 9;
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: PAGE_W / 2 - w / 2,
    y: MARGIN_BOTTOM - 20,
    size,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
}

// ─── Anchor tag helpers (invisible white text for DocuSign) ──────────────────

function drawAnchor(page: PDFPage, font: PDFFont, anchor: string, x: number, y: number) {
  page.drawText(anchor, {
    x,
    y,
    size: 1,
    font,
    color: rgb(1, 1, 1), // white — invisible
  });
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateContractPdf(params: GenerateContractParams): Promise<Uint8Array> {
  const { effectiveDate, customerName, monthlyPrice } = params;
  const monthlyPriceFormatted = fmtPrice(monthlyPrice);
  const monthlyPriceWords = priceWords(monthlyPrice);
  const termEndDate = 'January 1, 2027';

  const doc = PDFDocument.create ? await PDFDocument.create() : (() => { throw new Error('PDFDocument.create unavailable'); })();

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const pages: PDFPage[] = [];

  // ── PAGE 1 ────────────────────────────────────────────────────────────────

  const p1 = doc.addPage([PAGE_W, PAGE_H]);
  pages.push(p1);

  let ctx: DrawContext = {
    doc, page: p1, font, boldFont,
    y: PAGE_H - MARGIN_TOP,
    pages, pageNum: 1, totalPages: 4,
  };

  // Title (centered)
  const titleText = 'Software as a Service Agreement - Pilot Partner Chapters';
  const titleW = boldFont.widthOfTextAtSize(titleText, FONT_SIZE_TITLE);
  p1.drawText(titleText, {
    x: Math.max(MARGIN_L, PAGE_W / 2 - titleW / 2),
    y: ctx.y,
    size: FONT_SIZE_TITLE,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  ctx.y -= FONT_SIZE_TITLE * 2;

  ctx = drawWrappedText(ctx,
    `This Software as a Service Agreement ("Agreement") is entered into as of ${effectiveDate} (the "Effective Date") as defined herein below by and between Trailblaize, Inc. ("Company") and ${customerName} ("Customer"). The Company and Customer are referred to herein individually as a "Party" and collectively as the "Parties."`,
    { extraSpacingAfter: 6 }
  );

  ctx = drawWrappedText(ctx,
    '1. Service.',
    { bold: true }
  );
  ctx = drawWrappedText(ctx,
    'The Company shall provide Customer access to its cloud based software platform known as Trailblaize (the "Service"). The Service is provided on a subscription basis and may change or improve over time.',
    { indent: 16, extraSpacingAfter: 6 }
  );

  ctx = drawWrappedText(ctx, '2. Term and Renewal.', { bold: true });
  ctx = drawWrappedText(ctx,
    `This Agreement begins on the Effective Date and continues through ${termEndDate} (the "Initial Term"), unless earlier terminated pursuant to Section 8 below. Following the Initial Term, this Agreement may be renewed for additional terms ("Subsequent Term(s)") only upon mutual written agreement of both Parties. Such written agreement to renew must be executed by both Parties at least thirty (30) days prior to the expiration of the then-current term.`,
    { indent: 16, extraSpacingAfter: 6 }
  );

  ctx = drawWrappedText(ctx, '3. Fees and Payment.', { bold: true });
  ctx = drawWrappedText(ctx,
    `During the Initial Term, Customer agrees to pay ${monthlyPriceWords} per month for the Service. The fees for the Service for any Subsequent Term must be mutually agreed upon by the Parties in writing at least thirty-one (31) days prior to the commencement of such Subsequent Term. All fees are nonrefundable. Company reserves the right to suspend access to the Service for non-payment after reasonable notice.`,
    { indent: 16, extraSpacingAfter: 6 }
  );

  ctx = drawWrappedText(ctx, '4. Pilot Program.', { bold: true });
  ctx = drawWrappedText(ctx,
    'Customer acknowledges participation in a pilot program and that features, functionality, or availability may change as the Service evolves.',
    { indent: 16, extraSpacingAfter: 6 }
  );

  ctx = drawWrappedText(ctx, '5. Customer Responsibilities.', { bold: true });
  ctx = drawWrappedText(ctx,
    'Customer agrees to use the Service lawfully, ensure user compliance, safeguard login credentials, and provide accurate information as reasonably required.',
    { indent: 16, extraSpacingAfter: 6 }
  );

  ctx = drawWrappedText(ctx, '6. Data and Content.', { bold: true });
  ctx = drawWrappedText(ctx,
    'Customer retains sole and exclusive ownership of its data and Service. Company may use such data solely to operate and improve the Service and may use aggregated or anonymized data for analytics. Company will implement reasonable security measures.',
    { indent: 16, extraSpacingAfter: 6 }
  );

  ctx = drawWrappedText(ctx, '7. Intellectual Property.', { bold: true });
  ctx = drawWrappedText(ctx,
    'All intellectual property rights in the Service remain the sole and exclusive ownership of Company. Customer receives a limited, nontransferable right to access and use the Service during the term.',
    { indent: 16, extraSpacingAfter: 6 }
  );

  ctx = drawWrappedText(ctx, '8. Termination.', { bold: true });
  ctx = drawWrappedText(ctx,
    'This Agreement may be terminated at any time by the mutual consent of the Parties or may be terminated by either Party upon thirty (30) days\' written notice to the other Party. Upon termination, Customer shall pay Company any outstanding fees in accordance with Section 3 above.',
    { indent: 16, extraSpacingAfter: 6 }
  );

  ctx = drawWrappedText(ctx, '9. Confidentiality.', { bold: true, extraSpacingAfter: 2 });

  // ── PAGE 2 ────────────────────────────────────────────────────────────────

  const p2 = doc.addPage([PAGE_W, PAGE_H]);
  pages.push(p2);
  ctx = { ...ctx, page: p2, y: PAGE_H - MARGIN_TOP, pageNum: 2 };

  ctx = drawWrappedText(ctx, '9.1. Definition of Confidential Information.', { bold: true });
  ctx = drawWrappedText(ctx,
    '"Confidential Information" means any information disclosed by one Party to the other Party, either directly or indirectly, in writing, orally, or by inspection of tangible objects, that is designated as "Confidential," "Proprietary," or some similar designation, or that reasonably should be understood to be confidential given the nature of the information and circumstances of disclosure. Confidential Information includes, without limitation, business and marketing plans, technology and technical information, product plans and designs, and business processes.',
    { indent: 16, extraSpacingAfter: 6 }
  );

  ctx = drawWrappedText(ctx, '9.2. Not Confidential.', { bold: true });
  ctx = drawWrappedText(ctx,
    'Confidential Information shall not include any information that: (a) is or becomes generally known to the public without breach of any obligation owed to the disclosing Party; (b) was known to the receiving Party prior to its disclosure by the disclosing Party without breach of any obligation owed to the disclosing Party; (c) is received from a third party without breach of any obligation owed to the disclosing Party; or (d) was independently developed by the receiving Party without use of or reference to the disclosing Party\'s Confidential Information.',
    { indent: 16, extraSpacingAfter: 6 }
  );

  ctx = drawWrappedText(ctx, '9.3. Confidentiality.', { bold: true });
  ctx = drawWrappedText(ctx,
    'Each Party agrees to: (a) use the other Party\'s Confidential Information only for the purposes of this Agreement; (b) disclose such Confidential Information only to those employees, agents, or contractors who need to know it for such purposes and who are bound by confidentiality obligations at least as protective as those in this Agreement; and (c) protect such Confidential Information using the same degree of care it uses to protect its own confidential information, but in no event less than reasonable care. Each Party shall promptly notify the other of any unauthorized use or disclosure of Confidential Information.',
    { indent: 16, extraSpacingAfter: 6 }
  );

  ctx = drawWrappedText(ctx, '10. Disclaimer.', { bold: true });
  ctx = drawWrappedText(ctx,
    'THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE." TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, COMPANY EXPRESSLY DISCLAIMS ALL WARRANTIES, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING WITHOUT LIMITATION ANY WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. COMPANY DOES NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR COMPLETELY SECURE. CUSTOMER\'S USE OF THE SERVICE IS AT CUSTOMER\'S SOLE RISK.',
    { indent: 16, extraSpacingAfter: 6 }
  );

  // ── PAGE 3 ────────────────────────────────────────────────────────────────

  const p3 = doc.addPage([PAGE_W, PAGE_H]);
  pages.push(p3);
  ctx = { ...ctx, page: p3, y: PAGE_H - MARGIN_TOP, pageNum: 3 };

  ctx = drawWrappedText(ctx, '11. Indemnification.', { bold: true, extraSpacingAfter: 2 });

  ctx = drawWrappedText(ctx, '11.1.', { bold: true });
  ctx = drawWrappedText(ctx,
    'Customer shall defend, indemnify, and hold harmless Company and its officers, directors, employees, and agents from and against any and all claims, damages, obligations, losses, liabilities, costs, and expenses (including reasonable attorneys\' fees) arising out of or related to: (a) Customer\'s use of the Service in violation of this Agreement or applicable law; (b) Customer\'s data or content submitted through the Service; or (c) Customer\'s violation of any third-party rights.',
    { indent: 16, extraSpacingAfter: 6 }
  );

  ctx = drawWrappedText(ctx, '11.2.', { bold: true });
  ctx = drawWrappedText(ctx,
    'Company shall defend, indemnify, and hold harmless Customer and its officers, directors, employees, and agents from and against any and all claims, damages, obligations, losses, liabilities, costs, and expenses (including reasonable attorneys\' fees) arising out of or related to any claim that the Service, as provided by Company and used in accordance with this Agreement, infringes any third-party intellectual property right.',
    { indent: 16, extraSpacingAfter: 6 }
  );

  ctx = drawWrappedText(ctx, '12. Independent Contractor.', { bold: true });
  ctx = drawWrappedText(ctx,
    'The Parties are independent contractors. This Agreement does not create a partnership, franchise, joint venture, agency, fiduciary, or employment relationship between the Parties. Neither Party shall have the authority to bind the other or incur obligations on its behalf.',
    { indent: 16, extraSpacingAfter: 6 }
  );

  ctx = drawWrappedText(ctx, '13. Headings.', { bold: true });
  ctx = drawWrappedText(ctx,
    'Section headings in this Agreement are for convenience only and shall not affect the interpretation of this Agreement.',
    { indent: 16, extraSpacingAfter: 6 }
  );

  ctx = drawWrappedText(ctx, '14. Waiver.', { bold: true });
  ctx = drawWrappedText(ctx,
    'No failure or delay by either Party in exercising any right under this Agreement shall constitute a waiver of that right. A waiver of any right or remedy on any one occasion shall not be deemed a waiver of any other right or remedy or the same right or remedy on any future occasion.',
    { indent: 16, extraSpacingAfter: 6 }
  );

  // ── PAGE 4 — Signature Page ───────────────────────────────────────────────

  const p4 = doc.addPage([PAGE_W, PAGE_H]);
  pages.push(p4);
  ctx = { ...ctx, page: p4, y: PAGE_H - MARGIN_TOP, pageNum: 4 };

  ctx = drawWrappedText(ctx, '15. Modifications.', { bold: true });
  ctx = drawWrappedText(ctx,
    'This Agreement may not be modified or amended except by a written instrument signed by duly authorized representatives of both Parties. No modification or waiver of any provision of this Agreement shall be effective unless in writing and signed by both Parties.',
    { indent: 16, extraSpacingAfter: 6 }
  );

  ctx = drawWrappedText(ctx, '16. Severability.', { bold: true });
  ctx = drawWrappedText(ctx,
    'If any provision of this Agreement is held by a court of competent jurisdiction to be invalid, illegal, or unenforceable, the remaining provisions of this Agreement shall continue in full force and effect, and such invalid, illegal, or unenforceable provision shall be deemed modified to the minimum extent necessary to make it valid, legal, and enforceable.',
    { indent: 16, extraSpacingAfter: 6 }
  );

  ctx = drawWrappedText(ctx, '17. Governing Law.', { bold: true });
  ctx = drawWrappedText(ctx,
    'This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict of law provisions. Each Party consents to the exclusive jurisdiction of the state and federal courts located in the State of Delaware for any dispute arising out of or relating to this Agreement.',
    { indent: 16, extraSpacingAfter: 6 }
  );

  ctx = drawWrappedText(ctx, '18. Entire Agreement.', { bold: true });
  ctx = drawWrappedText(ctx,
    'This Agreement constitutes the entire agreement between the Parties with respect to its subject matter and supersedes all prior and contemporaneous agreements, representations, and understandings, whether written or oral, between the Parties relating to the subject matter hereof.',
    { indent: 16, extraSpacingAfter: 16 }
  );

  // Signature block intro
  ctx = drawWrappedText(ctx,
    'IN WITNESS WHEREOF, the Parties hereto have duly executed this Agreement as of the Effective Date as written herein above.',
    { extraSpacingAfter: 20 }
  );

  // ── Company block ──────────────────────────────────────────────────────────
  const sigBlockY = ctx.y;

  p4.drawText('Company: Trailblaize, Inc.', {
    x: MARGIN_L,
    y: sigBlockY,
    size: FONT_SIZE_BODY,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  ctx.y -= LINE_HEIGHT * 1.5;

  p4.drawText('Authorized Signature:', {
    x: MARGIN_L,
    y: ctx.y,
    size: FONT_SIZE_BODY,
    font,
    color: rgb(0, 0, 0),
  });
  // DocuSign anchor for company signature (signer 2)
  drawAnchor(p4, font, '\\s2\\', MARGIN_L + 140, ctx.y);
  p4.drawLine({ start: { x: MARGIN_L + 140, y: ctx.y - 4 }, end: { x: MARGIN_L + 340, y: ctx.y - 4 }, thickness: 0.5, color: rgb(0, 0, 0) });
  ctx.y -= LINE_HEIGHT * 1.5;

  p4.drawText('Name:', {
    x: MARGIN_L,
    y: ctx.y,
    size: FONT_SIZE_BODY,
    font,
    color: rgb(0, 0, 0),
  });
  // DocuSign anchor for company name (signer 2)
  drawAnchor(p4, font, '\\n2\\', MARGIN_L + 140, ctx.y);
  p4.drawLine({ start: { x: MARGIN_L + 140, y: ctx.y - 4 }, end: { x: MARGIN_L + 340, y: ctx.y - 4 }, thickness: 0.5, color: rgb(0, 0, 0) });
  ctx.y -= LINE_HEIGHT * 1.5;

  p4.drawText('Date:', {
    x: MARGIN_L,
    y: ctx.y,
    size: FONT_SIZE_BODY,
    font,
    color: rgb(0, 0, 0),
  });
  // DocuSign anchor for company date (signer 2)
  drawAnchor(p4, font, '\\d2\\', MARGIN_L + 140, ctx.y);
  p4.drawLine({ start: { x: MARGIN_L + 140, y: ctx.y - 4 }, end: { x: MARGIN_L + 340, y: ctx.y - 4 }, thickness: 0.5, color: rgb(0, 0, 0) });
  ctx.y -= LINE_HEIGHT * 2.5;

  // ── Customer block ─────────────────────────────────────────────────────────
  p4.drawText(`Customer: ${customerName}`, {
    x: MARGIN_L,
    y: ctx.y,
    size: FONT_SIZE_BODY,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  ctx.y -= LINE_HEIGHT * 1.5;

  p4.drawText('Authorized Signature:', {
    x: MARGIN_L,
    y: ctx.y,
    size: FONT_SIZE_BODY,
    font,
    color: rgb(0, 0, 0),
  });
  // DocuSign anchor for customer signature (signer 1)
  drawAnchor(p4, font, '\\s1\\', MARGIN_L + 140, ctx.y);
  p4.drawLine({ start: { x: MARGIN_L + 140, y: ctx.y - 4 }, end: { x: MARGIN_L + 340, y: ctx.y - 4 }, thickness: 0.5, color: rgb(0, 0, 0) });
  ctx.y -= LINE_HEIGHT * 1.5;

  p4.drawText('Name and Title:', {
    x: MARGIN_L,
    y: ctx.y,
    size: FONT_SIZE_BODY,
    font,
    color: rgb(0, 0, 0),
  });
  // DocuSign anchor for customer name (signer 1)
  drawAnchor(p4, font, '\\n1\\', MARGIN_L + 140, ctx.y);
  p4.drawLine({ start: { x: MARGIN_L + 140, y: ctx.y - 4 }, end: { x: MARGIN_L + 340, y: ctx.y - 4 }, thickness: 0.5, color: rgb(0, 0, 0) });
  ctx.y -= LINE_HEIGHT * 1.5;

  p4.drawText('Date:', {
    x: MARGIN_L,
    y: ctx.y,
    size: FONT_SIZE_BODY,
    font,
    color: rgb(0, 0, 0),
  });
  // DocuSign anchor for customer date (signer 1)
  drawAnchor(p4, font, '\\d1\\', MARGIN_L + 140, ctx.y);
  p4.drawLine({ start: { x: MARGIN_L + 140, y: ctx.y - 4 }, end: { x: MARGIN_L + 340, y: ctx.y - 4 }, thickness: 0.5, color: rgb(0, 0, 0) });

  // ── Page numbers ───────────────────────────────────────────────────────────
  drawPageNumber(p1, font, 1, 4);
  drawPageNumber(p2, font, 2, 4);
  drawPageNumber(p3, font, 3, 4);
  drawPageNumber(p4, font, 4, 4);

  return doc.save();
}

// ─── Tier pricing (shared, same as API) ───────────────────────────────────────

export function getPriceTier(memberCount: number): number {
  if (memberCount < 100) return 99;
  if (memberCount < 175) return 199;
  if (memberCount < 250) return 299;
  if (memberCount < 325) return 399;
  if (memberCount < 400) return 499;
  return 599;
}
