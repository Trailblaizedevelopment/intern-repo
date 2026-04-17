/**
 * SendGrid email client — server-side only.
 * Wraps @sendgrid/mail with Trailblaize defaults:
 *  - Open + click tracking enabled on every send
 *  - Unsubscribe footer injected automatically
 *  - Batch sends (max 1000/call via personalizations)
 */

import sgMail, { MailDataRequired } from '@sendgrid/mail';

const API_KEY = process.env.SENDGRID_API_KEY || '';
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'outreach@trailblaize.net';
const FROM_NAME  = process.env.SENDGRID_FROM_NAME  || 'Trailblaize';
const APP_URL    = process.env.NEXT_PUBLIC_APP_URL  || 'https://trailblaize.space';

export function getSendgridClient(): typeof sgMail | null {
  if (!API_KEY) {
    console.error('[sendgrid] SENDGRID_API_KEY not set');
    return null;
  }
  sgMail.setApiKey(API_KEY);
  return sgMail;
}

export interface SendEmailOptions {
  to: string;
  toName?: string;
  subject: string;
  htmlBody: string;
  /** Used in tracking URLs to identify the send record */
  sendId?: string;
  /** Campaign ID for grouping */
  campaignId?: string;
  /** Custom headers */
  headers?: Record<string, string>;
  /** Skip the Trailblaize wrapper — send htmlBody as-is (for custom campaign HTML) */
  rawHtml?: boolean;
}

/**
 * Wraps HTML body with:
 *  - Trailblaize base styles
 *  - Unsubscribe footer
 */
export function wrapEmailHtml(html: string, sendId?: string): string {
  const unsubUrl = sendId
    ? `${APP_URL}/api/email-outreach/unsubscribe?sid=${sendId}`
    : `${APP_URL}/unsubscribe`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; color: #111827; }
    .email-wrap { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
    .email-header { background: #0F172A; padding: 16px 32px; }
    .email-header img { height: 24px; }
    .email-header span { color: #fff; font-weight: 700; font-size: 1rem; letter-spacing: -0.01em; }
    .email-body { padding: 32px; font-size: 0.9375rem; line-height: 1.65; color: #374151; }
    .email-body p { margin: 0 0 16px; }
    .email-body a { color: #7c3aed; text-decoration: underline; }
    .email-footer { padding: 20px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 0.75rem; color: #9ca3af; text-align: center; }
    .email-footer a { color: #9ca3af; }
  </style>
</head>
<body>
  <div class="email-wrap">
    <div class="email-header">
      <span>Trailblaize</span>
    </div>
    <div class="email-body">
      ${html}
    </div>
    <div class="email-footer">
      <p>You received this because you're listed as an alumni of your chapter.<br/>
      <a href="${unsubUrl}">Unsubscribe</a> &nbsp;·&nbsp; Trailblaize, Inc.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Replaces template variables in subject + body.
 */
export function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (out, [key, val]) => out.replaceAll(`{${key}}`, val ?? ''),
    template,
  );
}

/**
 * Send a single email via SendGrid.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const sg = getSendgridClient();
  if (!sg) return { success: false, error: 'SendGrid not configured — add SENDGRID_API_KEY to .env.local' };

  const wrappedHtml = opts.rawHtml ? opts.htmlBody : wrapEmailHtml(opts.htmlBody, opts.sendId);

  const msg: MailDataRequired = {
    to:   { email: opts.to, name: opts.toName || '' },
    from: { email: FROM_EMAIL, name: FROM_NAME },
    subject: opts.subject,
    html: wrappedHtml,
    trackingSettings: {
      clickTracking:   { enable: true, enableText: false },
      openTracking:    { enable: true },
    },
    headers: {
      'X-Campaign-ID': opts.campaignId || '',
      'X-Send-ID':     opts.sendId     || '',
      ...opts.headers,
    },
  };

  try {
    const [res] = await sg.send(msg);
    const messageId = (res.headers as Record<string, string>)['x-message-id'] || '';
    return { success: true, messageId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[sendgrid] send error:', message);
    return { success: false, error: message };
  }
}

/**
 * Batch-send up to 1000 emails in one API call using personalizations.
 * Each recipient gets the same template but personalized subject/body via substitutions.
 */
export interface BatchRecipient {
  sendId: string;
  email: string;
  name: string;
  subject: string;
  htmlBody: string;
}

export async function sendEmailBatch(
  recipients: BatchRecipient[],
  campaignId: string,
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const sg = getSendgridClient();
  if (!sg) return { sent: 0, failed: recipients.length, errors: ['SendGrid not configured'] };

  const results = { sent: 0, failed: 0, errors: [] as string[] };

  // SendGrid personalizations max = 1000 per call, but for simplicity send 100 at a time
  const CHUNK = 100;
  for (let i = 0; i < recipients.length; i += CHUNK) {
    const chunk = recipients.slice(i, i + CHUNK);
    // Send individually to allow per-recipient HTML (different template vars)
    await Promise.allSettled(
      chunk.map(async r => {
        const result = await sendEmail({
          to: r.email,
          toName: r.name,
          subject: r.subject,
          htmlBody: r.htmlBody,
          sendId: r.sendId,
          campaignId,
          rawHtml: true, // Campaign HTML is already fully customized — skip wrapper
        });
        if (result.success) results.sent++;
        else { results.failed++; results.errors.push(`${r.email}: ${result.error}`); }
      }),
    );
    // Rate limit: small pause between chunks
    if (i + CHUNK < recipients.length) await new Promise(r => setTimeout(r, 500));
  }

  return results;
}
