'use client';

import React, { useState } from 'react';
import { EmailCampaignEditorV2 } from '../nucleus/customer-success/EmailCampaignEditorV2';

export default function TestEmailEditorV2Page() {
  const [html, setHtml] = useState('');

  return (
    <div style={{ padding: 40, maxWidth: 1000, margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1B2A4A', margin: '0 0 4px' }}>
          Email Composer V2 — Test
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0 }}>
          3-mode composer: Templates · AI Generate · HTML
        </p>
      </div>

      <EmailCampaignEditorV2
        value={html}
        onChange={setHtml}
        chapterName="Beta Theta Pi at Northwestern"
        chapterType="fraternity"
      />

      {html && (
        <div style={{ marginTop: 24 }}>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#374151', marginBottom: 8 }}>
            Output HTML ({html.length} chars)
          </label>
          <textarea
            value={html}
            readOnly
            rows={8}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.75rem', fontFamily: 'monospace', boxSizing: 'border-box', resize: 'vertical', background: '#f9fafb' }}
          />
        </div>
      )}
    </div>
  );
}
