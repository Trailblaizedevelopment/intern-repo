'use client';

import React, { useState } from 'react';
import { EmailCampaignEditor } from '../nucleus/customer-success/EmailCampaignEditor';

export default function TestEmailEditorPage() {
  const [html, setHtml] = useState('<p>Hey <strong>{first_name}</strong>,</p><p>We\'re rebuilding the <em>{chapter}</em> alumni network on Trailblaize — your chapter\'s new home for staying connected.</p><p>Take 2 minutes to claim your free profile and reconnect with brothers who\'ve gone before you.</p><p><a href="{signup_link}">Claim your profile →</a></p><p>See you on the inside,<br/>The Trailblaize Team</p>');

  return (
    <div style={{ padding: 40, maxWidth: 900, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>
          Email Campaign Editor — Test
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0 }}>
          Dual-mode editor: Visual (Tiptap) + HTML with live preview
        </p>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#374151', marginBottom: 6 }}>
          Subject Line
        </label>
        <input
          type="text"
          defaultValue="Join the {chapter} alumni network on Trailblaize"
          style={{ width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', boxSizing: 'border-box' }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#374151', marginBottom: 8 }}>
          Email Body
        </label>
        <EmailCampaignEditor
          value={html}
          onChange={setHtml}
          placeholder="Write your email body here…"
        />
      </div>

      <div style={{ marginTop: 16, padding: '10px 14px', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
        <p style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280' }}>
          <strong>Current HTML value:</strong> {html.length} chars
        </p>
      </div>
    </div>
  );
}
