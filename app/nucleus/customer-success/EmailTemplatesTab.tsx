'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Mail, Plus, Edit2, Copy, Check, Loader2, X, Eye, Code2 } from 'lucide-react';

/* ─── Types ─── */

interface EmailTemplate {
  id: string;
  chapter_id: string;
  touch_number: number;
  template_text: string;
  subject_line?: string;
  is_active: boolean;
  is_default?: boolean;
  created_at?: string;
}

interface Chapter {
  id: string;
  chapter_name: string;
}

interface EmailTemplatesTabProps {
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

const TOUCH_LABELS: Record<number, { label: string; color: string; bg: string }> = {
  1: { label: 'Touch 1 — Verify',    color: '#7c3aed', bg: '#ede9fe' },
  2: { label: 'Touch 2 — Pitch',     color: '#d97706', bg: '#fef3c7' },
  3: { label: 'Touch 3 — Follow-up', color: '#2563eb', bg: '#dbeafe' },
};

const TEMPLATE_VARS = [
  '{first_name}', '{last_name}', '{sender_name}',
  '{school}', '{fraternity}', '{signup_link}',
];

/* ─── Email preview builder ─── */

function isHtmlContent(content: string): boolean {
  return /<[a-z][\s\S]*>/i.test(content);
}

function plainTextToHtml(text: string): string {
  return text
    .split(/\n\n+/)
    .map(para => `<p>${para.replace(/\n/g, '<br />')}</p>`)
    .join('\n');
}

function buildPreviewHtml(body: string): string {
  const bodyHtml = isHtmlContent(body) ? body : plainTextToHtml(body);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; color: #111827; }
    .email-wrap { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
    .email-header { background: linear-gradient(135deg, #6d28d9, #8b5cf6); padding: 24px 32px; }
    .email-header span { color: #fff; font-weight: 700; font-size: 1.125rem; letter-spacing: -0.01em; }
    .email-body { padding: 32px; font-size: 0.9375rem; line-height: 1.65; color: #374151; }
    .email-body p { margin: 0 0 16px; }
    .email-body a { color: #7c3aed; text-decoration: underline; }
    .email-body strong { color: #111827; }
    .email-footer { padding: 20px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 0.75rem; color: #9ca3af; text-align: center; }
    .email-footer a { color: #9ca3af; }
  </style>
</head>
<body>
  <div class="email-wrap">
    <div class="email-header"><span>Trailblaize</span></div>
    <div class="email-body">${bodyHtml}</div>
    <div class="email-footer">
      <p>You received this because you're listed as an alumni of your chapter.<br/>
      <a href="#">Unsubscribe</a> &nbsp;·&nbsp; Trailblaize, Inc.</p>
    </div>
  </div>
</body>
</html>`;
}

/* ─── Component ─── */

export default function EmailTemplatesTab({ showToast }: EmailTemplatesTabProps) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<string>('');
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editor state
  const [editingTouch, setEditingTouch] = useState<number | null>(null);
  const [editorSubject, setEditorSubject] = useState('');
  const [editorContent, setEditorContent] = useState('');

  // Preview state
  const [previewTouch, setPreviewTouch] = useState<number | null>(null);
  const [previewMode, setPreviewMode] = useState<'rendered' | 'html'>('rendered');

  // Copy state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  /* ─── Data loading ─── */

  const fetchChapters = useCallback(async () => {
    try {
      const res = await fetch('/api/chapters');
      const json = await res.json();
      if (!json.error && json.data) {
        setChapters(json.data);
        // Do NOT auto-select — let the user pick the chapter explicitly
      }
    } catch { /* silent */ }
  }, []);

  const fetchTemplates = useCallback(async (chapterId: string) => {
    if (!chapterId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/outreach/templates?chapter_id=${chapterId}`);
      const json = await res.json();
      if (json.error) {
        showToast(json.error.message || 'Failed to load templates', 'error');
      } else {
        setTemplates(json.data?.templates || []);
      }
    } catch {
      showToast('Failed to load templates', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchChapters(); }, [fetchChapters]);
  useEffect(() => { if (selectedChapter) fetchTemplates(selectedChapter); }, [selectedChapter, fetchTemplates]);

  /* ─── Edit helpers ─── */

  function openEditor(touch: number) {
    const existing = templates.find(t => t.touch_number === touch);
    // Always pass a string to the editor — never null/undefined (crashes Tiptap)
    setEditorContent(existing?.template_text || getDefaultContent(touch));
    setEditorSubject(existing?.subject_line || getDefaultSubject(touch));
    setEditingTouch(touch);
    setPreviewTouch(null);
  }

  function closeEditor() {
    setEditingTouch(null);
    setEditorContent('');
    setEditorSubject('');
  }

  async function saveTemplate() {
    if (!selectedChapter || editingTouch === null) return;
    setSaving(true);
    try {
      const res = await fetch('/api/outreach/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapter_id: selectedChapter,
          touch_number: editingTouch,
          template_text: editorContent,
          subject_line: editorSubject.trim() || null,
        }),
      });
      const json = await res.json();
      if (json.error) {
        showToast(json.error.message || 'Failed to save template', 'error');
      } else {
        showToast('Template saved', 'success');
        closeEditor();
        // Refresh templates and auto-open preview for the saved touch
        await fetchTemplates(selectedChapter);
        setPreviewTouch(editingTouch);
        setPreviewMode('rendered');
      }
    } catch {
      showToast('Failed to save template', 'error');
    } finally {
      setSaving(false);
    }
  }

  /* ─── Copy HTML ─── */

  async function copyHTML(template: EmailTemplate) {
    const html = template.template_text;
    try {
      await navigator.clipboard.writeText(html);
      setCopiedId(template.id);
      setTimeout(() => setCopiedId(null), 2000);
      showToast('HTML copied to clipboard', 'success');
    } catch {
      showToast('Failed to copy', 'error');
    }
  }

  /* ─── Default content ─── */

  function getDefaultSubject(touch: number): string {
    if (touch === 1) return 'Verifying your alumni contact info';
    if (touch === 2) return 'Join the {fraternity} alumni network on Trailblaize';
    return 'Quick follow-up — {fraternity} alumni network';
  }

  function getDefaultContent(touch: number): string {
    if (touch === 1) return `<p>Hey, is this {first_name} {last_name}? My name is {sender_name}, and I'm checking to verify your phone number for the {school} {fraternity} alumni list.</p>`;
    if (touch === 2) return `<p>Hey {first_name},</p><p>I'm reaching out because we partnered with {school} {fraternity} to launch <strong>Trailblaize</strong> — a free platform that connects actives and alumni.</p><p>Here's your signup link: <a href="{signup_link}">{signup_link}</a></p><p>It takes 30 seconds to create your profile. Let me know if you have any questions!</p>`;
    return `<p>Hey {first_name},</p><p>Just following up — wanted to make sure you saw the link to join the {fraternity} alumni network on Trailblaize. It's free: <a href="{signup_link}">{signup_link}</a></p>`;
  }

  /* ─── Render ─── */

  const touchNumbers = [1, 2, 3];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #ec4899, #db2777)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
              <Mail size={16} />
            </div>
            Email Templates
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: '#6b7280' }}>
            Customize outreach messages per chapter. Variables: {TEMPLATE_VARS.join(', ')}
          </p>
        </div>

        {/* Chapter selector */}
        <select
          value={selectedChapter}
          onChange={e => { setSelectedChapter(e.target.value); setEditingTouch(null); setPreviewTouch(null); }}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', fontSize: '0.875rem', color: '#111827', cursor: 'pointer', minWidth: 180 }}
        >
          <option value="">Select chapter…</option>
          {chapters.map(ch => (
            <option key={ch.id} value={ch.id}>{ch.chapter_name}</option>
          ))}
        </select>
      </div>

      {!selectedChapter ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9ca3af', background: '#f9fafb', borderRadius: 14, border: '1px solid #e5e7eb' }}>
          <Mail size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }} />
          <p style={{ margin: 0, fontSize: '0.875rem' }}>Select a chapter to view or edit its templates</p>
        </div>
      ) : loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px', color: '#6b7280' }}>
          <Loader2 size={18} className="animate-spin" />
          <span style={{ fontSize: '0.875rem' }}>Loading templates…</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {touchNumbers.map(touch => {
            const cfg = TOUCH_LABELS[touch];
            const template = templates.find(t => t.touch_number === touch);
            const isEditing = editingTouch === touch;
            const isPreviewing = previewTouch === touch;
            const copied = template && copiedId === template.id;

            return (
              <div
                key={touch}
                style={{
                  borderRadius: 14,
                  border: isEditing ? `2px solid ${cfg.color}` : '1px solid #e5e7eb',
                  background: '#fff',
                  overflow: 'hidden',
                  transition: 'border-color 0.15s',
                }}
              >
                {/* Touch header */}
                <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, background: isEditing ? cfg.bg + '60' : '#fafafa', borderBottom: (isEditing || isPreviewing) ? '1px solid #f3f4f6' : 'none' }}>
                  <span style={{ padding: '3px 10px', borderRadius: 20, background: cfg.bg, color: cfg.color, fontWeight: 700, fontSize: '0.75rem', flexShrink: 0 }}>
                    {cfg.label}
                  </span>
                  {template && !template.is_default && (
                    <span style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 600, background: '#f0fdf4', padding: '1px 7px', borderRadius: 20 }}>
                      Custom
                    </span>
                  )}
                  {template?.is_default && (
                    <span style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 600, background: '#f3f4f6', padding: '1px 7px', borderRadius: 20 }}>
                      Default
                    </span>
                  )}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    {template && (
                      <>
                        <button
                          onClick={() => { setPreviewTouch(isPreviewing ? null : touch); setEditingTouch(null); }}
                          title="Preview"
                          style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #e5e7eb', background: isPreviewing ? '#f0f9ff' : '#fff', color: isPreviewing ? '#2563eb' : '#374151', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}
                        >
                          <Eye size={13} />
                          {isPreviewing ? 'Hide' : 'Preview'}
                        </button>
                        <button
                          onClick={() => copyHTML(template)}
                          title="Copy HTML"
                          style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #e5e7eb', background: copied ? '#f0fdf4' : '#fff', color: copied ? '#059669' : '#374151', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}
                        >
                          {copied ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy HTML</>}
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => isEditing ? closeEditor() : openEditor(touch)}
                      style={{ padding: '5px 10px', borderRadius: 7, border: `1px solid ${isEditing ? '#fecaca' : '#e5e7eb'}`, background: isEditing ? '#fef2f2' : '#fff', color: isEditing ? '#dc2626' : '#374151', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}
                    >
                      {isEditing ? <><X size={13} /> Cancel</> : template ? <><Edit2 size={13} /> Edit</> : <><Plus size={13} /> Create</>}
                    </button>
                  </div>
                </div>

                {/* Preview panel */}
                {isPreviewing && template && (
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6' }}>
                    {template.subject_line && (
                      <div style={{ marginBottom: 10, padding: '8px 12px', background: '#f9fafb', borderRadius: 8, border: '1px solid #f3f4f6' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Subject: </span>
                        <span style={{ fontSize: '0.875rem', color: '#374151' }}>{template.subject_line}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      {(['rendered', 'html'] as const).map(mode => (
                        <button
                          key={mode}
                          onClick={() => setPreviewMode(mode)}
                          style={{ padding: '4px 12px', borderRadius: 7, border: '1px solid #e5e7eb', background: previewMode === mode ? '#111827' : '#fff', color: previewMode === mode ? '#fff' : '#374151', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}
                        >
                          {mode === 'rendered' ? <><Eye size={12} /> Rendered</> : <><Code2 size={12} /> HTML</>}
                        </button>
                      ))}
                    </div>
                    {previewMode === 'rendered' ? (
                      <iframe
                        key={template.template_text}
                        srcDoc={buildPreviewHtml(template.template_text || '')}
                        style={{ width: '100%', height: 520, border: '1px solid #e5e7eb', borderRadius: 10, background: '#f9fafb', display: 'block' }}
                        title={`Preview Touch ${touch}`}
                      />
                    ) : (
                      <pre style={{ margin: 0, padding: '12px 16px', background: '#1e1e2e', color: '#cdd6f4', borderRadius: 10, fontSize: '0.75rem', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6 }}>
                        {template.template_text}
                      </pre>
                    )}
                  </div>
                )}

                {/* Editor panel */}
                {isEditing && (
                  <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Subject line */}
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Subject Line <span style={{ color: '#9ca3af', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                      </label>
                      <input
                        type="text"
                        value={editorSubject}
                        onChange={e => setEditorSubject(e.target.value)}
                        placeholder={getDefaultSubject(touch)}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', color: '#111827', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>

                    {/* Body editor */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          HTML Body
                        </label>
                        <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Plain text also works — auto-formatted on preview</span>
                      </div>
                      {/* Variable chips */}
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                        {TEMPLATE_VARS.map(v => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setEditorContent(prev => prev + v)}
                            style={{ padding: '2px 8px', borderRadius: 6, background: '#f3f4f6', color: '#6b7280', fontSize: '0.7rem', fontFamily: 'monospace', cursor: 'pointer', border: '1px solid #e5e7eb' }}
                            title={`Insert ${v}`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={editorContent}
                        onChange={e => setEditorContent(e.target.value)}
                        placeholder={`Paste your HTML or write your email here.\n\nExample:\n<h2>Hey {first_name}!</h2>\n<p>We're rebuilding the {fraternity} alumni network...</p>\n<p><a href="{signup_link}">Join here →</a></p>`}
                        rows={14}
                        spellCheck={false}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          border: '1px solid #e5e7eb',
                          borderRadius: 8,
                          fontSize: '0.8125rem',
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                          boxSizing: 'border-box',
                          resize: 'vertical',
                          outline: 'none',
                          lineHeight: 1.6,
                          color: '#111827',
                          background: '#fafafa',
                        }}
                      />
                      <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: '#9ca3af' }}>
                        Write full HTML for rich emails, or plain text for simple ones. Click variable buttons above to insert them.
                      </p>
                    </div>

                    {/* Save / Cancel */}
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
                      <button
                        onClick={closeEditor}
                        style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveTemplate}
                        disabled={saving || !editorContent.trim()}
                        style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: saving ? '#9ca3af' : `linear-gradient(135deg, ${cfg.color}, ${cfg.color}cc)`, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.875rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}
                      >
                        {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Save Template'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
