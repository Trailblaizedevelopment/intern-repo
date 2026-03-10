'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Mail, Plus, Edit2, Trash2, Eye, ArrowLeft, Loader2, X, Tag,
} from 'lucide-react';

/* ─── Types ─── */

interface EmailTemplate {
  id: string;
  name: string;
  description?: string;
  category: 'onboarding' | 'follow-up' | 'nurture' | 'announcement';
  subject_line: string;
  html_content: string;
  tags?: string[];
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

interface EmailTemplatesTabProps {
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

/* ─── Constants ─── */

const CATEGORIES = ['onboarding', 'follow-up', 'nurture', 'announcement'] as const;

const CATEGORY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  onboarding:    { label: 'Onboarding',    color: '#7c3aed', bg: '#ede9fe' },
  'follow-up':   { label: 'Follow-up',     color: '#d97706', bg: '#fef3c7' },
  nurture:       { label: 'Nurture',       color: '#2563eb', bg: '#dbeafe' },
  announcement:  { label: 'Announcement',  color: '#059669', bg: '#d1fae5' },
};

const TEMPLATE_VARS = [
  '{first_name}', '{last_name}', '{chapter}',
  '{signup_link}', '{school}', '{fraternity}',
];

/* ─── Preview builder ─── */

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
    .email-wrap { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
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

/* ─── Helpers ─── */

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

/* ═══════════════════════════════════════════════════ COMPONENT ═ */

export default function EmailTemplatesTab({ showToast }: EmailTemplatesTabProps) {
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);

  // Editor state
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('onboarding');
  const [subjectLine, setSubjectLine] = useState('');
  const [description, setDescription] = useState('');
  const [htmlContent, setHtmlContent] = useState('');

  // Debounced preview key (iframe key — triggers re-render after 500ms idle)
  const [debouncedHtml, setDebouncedHtml] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Textarea cursor tracking
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* ─── Debounce live preview ─── */

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedHtml(htmlContent);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [htmlContent]);

  /* ─── Data loading ─── */

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/email-templates');
      const json = await res.json();
      if (json.error) {
        showToast(json.error?.message || 'Failed to load templates', 'error');
      } else {
        setTemplates(json.data || []);
      }
    } catch {
      showToast('Failed to load templates', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  /* ─── Editor open/close ─── */

  function openNewEditor() {
    setEditingTemplate(null);
    setName('');
    setCategory('onboarding');
    setSubjectLine('');
    setDescription('');
    setHtmlContent('');
    setDebouncedHtml('');
    setView('editor');
  }

  function openEditEditor(template: EmailTemplate) {
    setEditingTemplate(template);
    setName(template.name);
    setCategory(template.category);
    setSubjectLine(template.subject_line);
    setDescription(template.description || '');
    setHtmlContent(template.html_content);
    setDebouncedHtml(template.html_content);
    setView('editor');
  }

  function closeEditor() {
    setView('list');
    setEditingTemplate(null);
  }

  /* ─── Variable insertion at cursor ─── */

  function insertVariable(variable: string) {
    const el = textareaRef.current;
    if (!el) {
      setHtmlContent(prev => prev + variable);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const before = htmlContent.slice(0, start);
    const after = htmlContent.slice(end);
    const newContent = before + variable + after;
    setHtmlContent(newContent);
    // Restore cursor position after React re-render
    requestAnimationFrame(() => {
      el.focus();
      const newCursor = start + variable.length;
      el.setSelectionRange(newCursor, newCursor);
    });
  }

  /* ─── Save ─── */

  async function saveTemplate() {
    if (!name.trim()) { showToast('Template name is required', 'error'); return; }
    if (!subjectLine.trim()) { showToast('Subject line is required', 'error'); return; }
    if (!htmlContent.trim()) { showToast('HTML body is required', 'error'); return; }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        category,
        subject_line: subjectLine.trim(),
        description: description.trim() || undefined,
        html_content: htmlContent,
        tags: [],
      };

      const isEdit = !!editingTemplate;
      const url = isEdit ? `/api/email-templates/${editingTemplate!.id}` : '/api/email-templates';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (json.error) {
        showToast(json.error?.message || 'Failed to save template', 'error');
      } else {
        showToast(isEdit ? 'Template updated' : 'Template created', 'success');
        closeEditor();
        fetchTemplates();
      }
    } catch {
      showToast('Failed to save template', 'error');
    } finally {
      setSaving(false);
    }
  }

  /* ─── Delete ─── */

  async function deleteTemplate(id: string, templateName: string) {
    if (!confirm(`Delete "${templateName}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/email-templates/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        showToast(json.error?.message || 'Failed to delete template', 'error');
      } else {
        showToast('Template deleted', 'info');
        setTemplates(prev => prev.filter(t => t.id !== id));
        if (previewTemplateId === id) setPreviewTemplateId(null);
      }
    } catch {
      showToast('Failed to delete template', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  /* ═══════════════ VIEW: LIST ═══════════════ */

  if (view === 'list') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'linear-gradient(135deg, #6d28d9, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0,
              }}>
                <Mail size={16} />
              </div>
              Email Templates
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: '#6b7280' }}>
              Standalone HTML email templates for SendGrid campaigns. Templates are global — chapters are applied at campaign creation.
            </p>
          </div>
          <button
            onClick={openNewEditor}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg, #6d28d9, #8b5cf6)',
              color: '#fff', fontWeight: 700, fontSize: '0.875rem',
              cursor: 'pointer', boxShadow: '0 2px 8px rgba(109,40,217,0.25)',
              whiteSpace: 'nowrap',
            }}
          >
            <Plus size={16} /> New Template
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px', color: '#6b7280' }}>
            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '0.875rem' }}>Loading templates…</span>
          </div>
        ) : templates.length === 0 ? (
          <div style={{
            padding: '64px 24px', textAlign: 'center', color: '#9ca3af',
            background: '#f9fafb', borderRadius: 14, border: '2px dashed #e5e7eb',
          }}>
            <Mail size={40} style={{ margin: '0 auto 16px', display: 'block', opacity: 0.35 }} />
            <p style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 600, color: '#6b7280' }}>No templates yet</p>
            <p style={{ margin: '0 0 20px', fontSize: '0.875rem' }}>Create your first email template to get started</p>
            <button
              onClick={openNewEditor}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '9px 18px', borderRadius: 8, border: 'none',
                background: 'linear-gradient(135deg, #6d28d9, #8b5cf6)',
                color: '#fff', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer',
              }}
            >
              <Plus size={15} /> New Template
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {templates.map(template => {
              const catCfg = CATEGORY_CONFIG[template.category] || CATEGORY_CONFIG['onboarding'];
              const isPreviewing = previewTemplateId === template.id;
              const isDeleting = deletingId === template.id;

              return (
                <div
                  key={template.id}
                  style={{
                    borderRadius: 14,
                    border: '1px solid #e5e7eb',
                    background: '#fff',
                    overflow: 'hidden',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                    transition: 'box-shadow 0.15s',
                  }}
                >
                  {/* Card header row */}
                  <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    {/* Icon */}
                    <div style={{
                      width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                      background: 'linear-gradient(135deg, #6d28d9, #8b5cf6)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                    }}>
                      <Mail size={18} />
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                        <span
                          style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#111827', cursor: 'pointer' }}
                          onClick={() => openEditEditor(template)}
                        >
                          {template.name}
                        </span>
                        <span style={{
                          padding: '2px 9px', borderRadius: 20,
                          background: catCfg.bg, color: catCfg.color,
                          fontWeight: 700, fontSize: '0.7rem',
                          textTransform: 'capitalize',
                        }}>
                          {catCfg.label}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: 2 }}>
                        <span style={{ fontStyle: 'italic' }}>Subject: </span>
                        {template.subject_line}
                      </div>
                      {template.description && (
                        <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: 2 }}>
                          {template.description}
                        </div>
                      )}
                      <div style={{ fontSize: '0.75rem', color: '#d1d5db' }}>
                        Created {formatDate(template.created_at)}
                        {template.updated_at && template.updated_at !== template.created_at && (
                          <> · Updated {formatDate(template.updated_at)}</>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => setPreviewTemplateId(isPreviewing ? null : template.id)}
                        title="Preview"
                        style={{
                          padding: '5px 11px', borderRadius: 7,
                          border: '1px solid #e5e7eb',
                          background: isPreviewing ? '#f0f9ff' : '#fff',
                          color: isPreviewing ? '#2563eb' : '#374151',
                          cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                          display: 'flex', alignItems: 'center', gap: 5,
                        }}
                      >
                        {isPreviewing ? <><X size={12} /> Close</> : <><Eye size={12} /> Preview</>}
                      </button>
                      <button
                        onClick={() => openEditEditor(template)}
                        title="Edit"
                        style={{
                          padding: '5px 11px', borderRadius: 7,
                          border: '1px solid #e5e7eb', background: '#fff',
                          color: '#374151', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                          display: 'flex', alignItems: 'center', gap: 5,
                        }}
                      >
                        <Edit2 size={12} /> Edit
                      </button>
                      <button
                        onClick={() => deleteTemplate(template.id, template.name)}
                        disabled={isDeleting}
                        title="Delete"
                        style={{
                          padding: '5px 11px', borderRadius: 7,
                          border: '1px solid #fecaca', background: '#fef2f2',
                          color: '#dc2626', cursor: isDeleting ? 'not-allowed' : 'pointer',
                          fontSize: '0.75rem', fontWeight: 600,
                          display: 'flex', alignItems: 'center', gap: 5,
                          opacity: isDeleting ? 0.6 : 1,
                        }}
                      >
                        {isDeleting ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={12} />}
                        {isDeleting ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>

                  {/* Tags row */}
                  {template.tags && template.tags.length > 0 && (
                    <div style={{ padding: '0 18px 12px', display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                      <Tag size={11} style={{ color: '#9ca3af' }} />
                      {template.tags.map(tag => (
                        <span key={tag} style={{
                          padding: '1px 8px', borderRadius: 20,
                          background: '#f3f4f6', color: '#6b7280',
                          fontSize: '0.7rem', fontWeight: 500,
                        }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Preview panel */}
                  {isPreviewing && (
                    <div style={{ padding: '0 18px 18px', borderTop: '1px solid #f3f4f6' }}>
                      <div style={{ marginBottom: 10, marginTop: 12, padding: '8px 12px', background: '#f9fafb', borderRadius: 8, border: '1px solid #f3f4f6' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Subject: </span>
                        <span style={{ fontSize: '0.875rem', color: '#374151' }}>{template.subject_line}</span>
                      </div>
                      <iframe
                        key={template.html_content}
                        srcDoc={buildPreviewHtml(template.html_content || '')}
                        style={{
                          width: '100%', height: 520, border: '1px solid #e5e7eb',
                          borderRadius: 10, background: '#f9fafb', display: 'block',
                        }}
                        title={`Preview: ${template.name}`}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <style>{`
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  /* ═══════════════ VIEW: EDITOR ═══════════════ */

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Editor header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          onClick={closeEditor}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 8,
            border: '1px solid #e5e7eb', background: '#fff',
            color: '#374151', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600,
          }}
        >
          <ArrowLeft size={14} /> Back
        </button>
        <div>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827' }}>
            {editingTemplate ? `Edit: ${editingTemplate.name}` : 'New Email Template'}
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: '0.8125rem', color: '#6b7280' }}>
            HTML email template for SendGrid campaigns
          </p>
        </div>
      </div>

      {/* Two-panel layout */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

        {/* ── LEFT: Editor panel (55%) ── */}
        <div style={{ flex: '0 0 55%', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Template Name */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Template Name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Welcome Email — Fraternity Outreach"
              style={{
                width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb',
                borderRadius: 8, fontSize: '0.875rem', color: '#111827', outline: 'none',
                boxSizing: 'border-box', background: '#fff',
              }}
            />
          </div>

          {/* Category + Subject line side by side */}
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: '0 0 40%' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Category
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                style={{
                  width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb',
                  borderRadius: 8, fontSize: '0.875rem', color: '#111827',
                  outline: 'none', cursor: 'pointer', background: '#fff',
                  boxSizing: 'border-box',
                }}
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{CATEGORY_CONFIG[cat].label}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Subject Line <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                value={subjectLine}
                onChange={e => setSubjectLine(e.target.value)}
                placeholder="e.g. Join the {fraternity} alumni network on Trailblaize"
                style={{
                  width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb',
                  borderRadius: 8, fontSize: '0.875rem', color: '#111827', outline: 'none',
                  boxSizing: 'border-box', background: '#fff',
                }}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#374151', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Description <span style={{ fontWeight: 400, color: '#9ca3af', textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief description of when to use this template"
              style={{
                width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb',
                borderRadius: 8, fontSize: '0.8125rem', color: '#6b7280', outline: 'none',
                boxSizing: 'border-box', background: '#fff',
              }}
            />
          </div>

          {/* HTML Body */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                HTML Body <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                Paste full HTML or write plain text — both render correctly
              </span>
            </div>

            {/* Variable chips */}
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
              {TEMPLATE_VARS.map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insertVariable(v)}
                  style={{
                    padding: '3px 9px', borderRadius: 6,
                    background: '#f0f0ff', color: '#6d28d9',
                    fontSize: '0.7rem', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    cursor: 'pointer', border: '1px solid #c4b5fd',
                    fontWeight: 600, transition: 'background 0.1s',
                  }}
                  title={`Insert ${v}`}
                >
                  {v}
                </button>
              ))}
            </div>

            <textarea
              ref={textareaRef}
              value={htmlContent}
              onChange={e => setHtmlContent(e.target.value)}
              placeholder={`Paste your HTML or write your email here.\n\nExample:\n<h2>Hey {first_name}!</h2>\n<p>We're rebuilding the {fraternity} alumni network on Trailblaize...</p>\n<p><a href="{signup_link}">Claim your profile →</a></p>`}
              rows={20}
              spellCheck={false}
              style={{
                width: '100%', padding: '10px 12px',
                border: '1px solid #e5e7eb', borderRadius: 8,
                fontSize: '0.8125rem',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                boxSizing: 'border-box', resize: 'vertical', outline: 'none',
                lineHeight: 1.6, color: '#111827', background: '#fafafa',
              }}
            />
            <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: '#9ca3af' }}>
              Click a variable chip above to insert it at the cursor position.
            </p>
          </div>

          {/* Save / Cancel */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4, paddingBottom: 20 }}>
            <button
              onClick={closeEditor}
              style={{
                padding: '9px 18px', borderRadius: 8, border: '1px solid #e5e7eb',
                background: '#fff', color: '#374151', cursor: 'pointer',
                fontSize: '0.875rem', fontWeight: 600,
              }}
            >
              Cancel
            </button>
            <button
              onClick={saveTemplate}
              disabled={saving || !name.trim() || !subjectLine.trim() || !htmlContent.trim()}
              style={{
                padding: '9px 20px', borderRadius: 8, border: 'none',
                background: saving
                  ? '#9ca3af'
                  : 'linear-gradient(135deg, #6d28d9, #8b5cf6)',
                color: '#fff', cursor: (saving || !name.trim() || !subjectLine.trim() || !htmlContent.trim()) ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 8,
                boxShadow: saving ? 'none' : '0 2px 8px rgba(109,40,217,0.25)',
                opacity: (!name.trim() || !subjectLine.trim() || !htmlContent.trim()) && !saving ? 0.5 : 1,
              }}
            >
              {saving
                ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                : editingTemplate ? 'Save Changes' : 'Create Template'
              }
            </button>
          </div>
        </div>

        {/* ── RIGHT: Live preview panel (45%) ── */}
        <div style={{
          flex: '0 0 calc(45% - 20px)',
          position: 'sticky', top: 20,
          maxHeight: 'calc(100vh - 100px)',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            fontSize: '0.75rem', fontWeight: 700, color: '#374151',
            textTransform: 'uppercase', letterSpacing: '0.04em',
            marginBottom: 8,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Eye size={13} /> Live Preview
            <span style={{ fontWeight: 400, color: '#9ca3af', textTransform: 'none', letterSpacing: 0, fontSize: '0.7rem' }}>
              · updates as you type
            </span>
          </div>
          {debouncedHtml ? (
            <iframe
              key={debouncedHtml}
              srcDoc={buildPreviewHtml(debouncedHtml)}
              style={{
                flex: 1,
                width: '100%',
                minHeight: 600,
                border: '1px solid #e5e7eb',
                borderRadius: 10,
                background: '#f9fafb',
                display: 'block',
              }}
              title="Live Preview"
            />
          ) : (
            <div style={{
              flex: 1, minHeight: 600,
              border: '1px solid #e5e7eb', borderRadius: 10,
              background: '#f9fafb',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 10, color: '#9ca3af',
            }}>
              <Mail size={32} style={{ opacity: 0.3 }} />
              <span style={{ fontSize: '0.8125rem' }}>Start typing to see preview</span>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
