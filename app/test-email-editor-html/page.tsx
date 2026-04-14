'use client';

/**
 * Test page for the HTML mode of EmailCampaignEditor.
 * This page immediately shows the HTML mode with a sample HTML email and live preview.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Eye } from 'lucide-react';

const SAMPLE_HTML = `<h2>Hey {first_name}! 👋</h2>
<p>We're rebuilding the <strong>{chapter}</strong> alumni network on Trailblaize — your chapter's new home for staying connected with brothers who've gone before you.</p>
<p>Take 2 minutes to claim your free profile:</p>
<ul>
  <li>Connect with chapter alumni across every class year</li>
  <li>Get early access to job postings and mentorship</li>
  <li>Build your professional network the right way</li>
</ul>
<p><a href="{signup_link}">Claim your profile →</a></p>
<p>See you on the inside,<br/><strong>The Trailblaize Team</strong></p>`;

function isHtml(content: string): boolean {
  return /<[a-z][\s\S]*>/i.test(content);
}
function plainTextToHtml(text: string): string {
  return text.split(/\n\n+/).map(para => `<p>${para.replace(/\n/g, '<br />')}</p>`).join('\n');
}
function buildEmailPreview(body: string): string {
  const bodyHtml = isHtml(body) ? body : plainTextToHtml(body);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; color: #111827; }
    .email-wrap { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    .email-header { background: linear-gradient(135deg, #6d28d9, #8b5cf6); padding: 22px 28px; }
    .email-header span { color: #fff; font-weight: 700; font-size: 1.125rem; }
    .email-body { padding: 28px 32px; font-size: 0.9375rem; line-height: 1.7; color: #374151; }
    .email-body p { margin: 0 0 14px; }
    .email-body h1, .email-body h2, .email-body h3 { margin: 0 0 12px; color: #111827; }
    .email-body a { color: #7c3aed; text-decoration: underline; }
    .email-body strong { color: #111827; }
    .email-body ul, .email-body ol { margin: 0 0 14px; padding-left: 20px; }
    .email-body li { margin-bottom: 4px; }
    .email-footer { padding: 18px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 0.75rem; color: #9ca3af; text-align: center; }
  </style>
</head>
<body>
  <div class="email-wrap">
    <div class="email-header"><span>Trailblaize</span></div>
    <div class="email-body">${bodyHtml}</div>
    <div class="email-footer"><p>You received this because you're listed as an alumni of your chapter.<br/><a href="#">Unsubscribe</a> · Trailblaize, Inc.</p></div>
  </div>
</body>
</html>`;
}

export default function TestHtmlModePage() {
  const [html, setHtml] = useState(SAMPLE_HTML);
  const [preview, setPreview] = useState(SAMPLE_HTML);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setPreview(html), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [html]);

  return (
    <div style={{ padding: 40, maxWidth: 1200, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>
          Email Campaign Editor — HTML Mode
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0 }}>
          Raw HTML textarea with live email preview
        </p>
      </div>

      {/* Simulated tab bar */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff', overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', padding: '0 12px' }}>
          <button style={{ padding: '9px 14px', border: 'none', borderBottom: '2px solid transparent', background: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 500, color: '#6b7280', marginBottom: -1 }}>
            ✏️ Visual
          </button>
          <button style={{ padding: '9px 14px', border: 'none', borderBottom: '2px solid #6d28d9', background: 'none', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 700, color: '#6d28d9', marginBottom: -1 }}>
            {'<>'} HTML
          </button>
        </div>

        <div style={{ display: 'flex' }}>
          {/* Textarea */}
          <div style={{ flex: '0 0 50%', display: 'flex', flexDirection: 'column', borderRight: '1px solid #e5e7eb' }}>
            <div style={{ padding: '6px 12px', background: '#f9fafb', borderBottom: '1px solid #f0ede8', fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              HTML Source
            </div>
            <textarea
              value={html}
              onChange={e => setHtml(e.target.value)}
              spellCheck={false}
              style={{ flex: 1, width: '100%', minHeight: 380, padding: '12px 14px', border: 'none', outline: 'none', resize: 'none', fontSize: '0.8rem', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: 1.6, color: '#374151', background: '#fafafa', boxSizing: 'border-box' }}
            />
          </div>

          {/* Preview */}
          <div style={{ flex: '0 0 50%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '6px 12px', background: '#f9fafb', borderBottom: '1px solid #f0ede8', fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Eye size={11} /> Live Preview
              <span style={{ fontWeight: 400, color: '#d1d5db', textTransform: 'none', letterSpacing: 0 }}>· updates as you type</span>
            </div>
            <iframe
              key={preview}
              srcDoc={buildEmailPreview(preview)}
              sandbox="allow-same-origin"
              style={{ flex: 1, width: '100%', minHeight: 380, border: 'none', background: '#f9fafb', display: 'block' }}
              title="Email Preview"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
