'use client';

/**
 * EmailCampaignEditor
 *
 * Dual-mode email body editor for the Campaign creation form.
 *
 * Mode 1 — Visual: Tiptap rich-text editor with a native-feeling toolbar
 * Mode 2 — HTML:   Raw HTML textarea + live iframe preview panel
 *
 * Switching modes converts content bidirectionally:
 *   Visual → HTML  : exports Tiptap HTML
 *   HTML   → Visual: imports raw HTML into Tiptap
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { Eye } from 'lucide-react';

/* ─────────────────────────────────────────── Types ─── */

interface EmailCampaignEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

type EditorMode = 'visual' | 'html';

/* ─────────────────────────────────────── Preview builder ─── */

function isHtml(content: string): boolean {
  return /<[a-z][\s\S]*>/i.test(content);
}

function plainTextToHtml(text: string): string {
  return text
    .split(/\n\n+/)
    .map(para => `<p>${para.replace(/\n/g, '<br />')}</p>`)
    .join('\n');
}

function buildEmailPreview(body: string): string {
  const bodyHtml = isHtml(body) ? body : plainTextToHtml(body);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; color: #111827; }
    .email-wrap { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    .email-header { background: linear-gradient(135deg, #6d28d9, #8b5cf6); padding: 22px 28px; }
    .email-header span { color: #fff; font-weight: 700; font-size: 1.125rem; letter-spacing: -0.01em; }
    .email-body { padding: 28px 32px; font-size: 0.9375rem; line-height: 1.7; color: #374151; }
    .email-body p { margin: 0 0 14px; }
    .email-body h1, .email-body h2, .email-body h3 { margin: 0 0 12px; color: #111827; }
    .email-body a { color: #7c3aed; text-decoration: underline; }
    .email-body strong { color: #111827; }
    .email-body ul, .email-body ol { margin: 0 0 14px; padding-left: 20px; }
    .email-body li { margin-bottom: 4px; }
    .email-body blockquote { margin: 0 0 14px; padding: 10px 16px; border-left: 3px solid #e5e7eb; background: #f9fafb; color: #6b7280; font-style: italic; }
    .email-footer { padding: 18px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 0.75rem; color: #9ca3af; text-align: center; }
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

/* ─────────────────────────────────────── Toolbar ─── */

const ToolbarButton = ({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    style={{
      padding: '4px 8px',
      borderRadius: 5,
      border: active ? '1px solid #c4b5fd' : '1px solid transparent',
      background: active ? '#ede9fe' : 'transparent',
      color: active ? '#6d28d9' : '#374151',
      cursor: 'pointer',
      fontSize: '0.8125rem',
      fontWeight: 600,
      lineHeight: 1,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 28,
      height: 28,
      transition: 'all 0.1s ease',
    }}
    onMouseEnter={e => {
      if (!active) (e.currentTarget as HTMLButtonElement).style.background = '#f5f3ff';
    }}
    onMouseLeave={e => {
      if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
    }}
  >
    {children}
  </button>
);

const ToolbarDivider = () => (
  <span
    style={{
      width: 1,
      height: 20,
      background: '#e5e7eb',
      display: 'inline-block',
      margin: '0 4px',
      flexShrink: 0,
    }}
  />
);

/* ─────────────────────────────────────── Main component ─── */

export function EmailCampaignEditor({
  value,
  onChange,
  placeholder = 'Write your email body here…',
}: EmailCampaignEditorProps) {
  const [mode, setMode] = useState<EditorMode>('visual');
  const [rawHtml, setRawHtml] = useState<string>(value || '');
  const [debouncedPreview, setDebouncedPreview] = useState<string>(value || '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* ── Tiptap editor ── */
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Underline,
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html);
    },
    editorProps: {
      attributes: {
        class: 'ece-content',
        'data-placeholder': placeholder,
        style: 'min-height: 220px; outline: none;',
      },
    },
  });

  /* ── Keep editor in sync when value is set externally (e.g. template load) ── */
  const lastExternalValue = useRef(value);
  useEffect(() => {
    if (!editor) return;
    if (value === lastExternalValue.current) return;
    lastExternalValue.current = value;
    // Only sync if content actually differs (avoid cursor jump loops)
    if (editor.getHTML() !== value) {
      editor.commands.setContent(value || '');
    }
    setRawHtml(value || '');
    setDebouncedPreview(value || '');
  }, [value, editor]);

  /* ── Debounce preview in HTML mode ── */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedPreview(rawHtml), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [rawHtml]);

  /* ── Mode switching ── */
  const switchMode = useCallback((next: EditorMode) => {
    if (next === mode) return;
    if (next === 'html') {
      // Visual → HTML: export Tiptap HTML
      const html = editor?.getHTML() || '';
      const exported = (html === '<p></p>' || !html) ? '' : html;
      setRawHtml(exported);
      setDebouncedPreview(exported);
      onChange(exported);
    } else {
      // HTML → Visual: import raw HTML into Tiptap
      if (editor) {
        editor.commands.setContent(rawHtml || '');
        onChange(rawHtml);
      }
    }
    setMode(next);
  }, [mode, editor, rawHtml, onChange]);

  /* ── Raw HTML textarea change ── */
  const handleRawChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setRawHtml(v);
    onChange(v);
  }, [onChange]);

  /* ── Link insertion ── */
  const setLink = useCallback(() => {
    if (!editor) return;
    const url = window.prompt('Enter URL');
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  /* ─── Styles ─── */
  const containerStyle: React.CSSProperties = {
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    background: '#fff',
    overflow: 'hidden',
  };

  const tabRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    borderBottom: '1px solid #e5e7eb',
    background: '#f9fafb',
    padding: '0 12px',
    gap: 0,
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '9px 14px',
    border: 'none',
    borderBottom: active ? '2px solid #6d28d9' : '2px solid transparent',
    background: 'none',
    cursor: 'pointer',
    fontSize: '0.8125rem',
    fontWeight: active ? 700 : 500,
    color: active ? '#6d28d9' : '#6b7280',
    marginBottom: -1,
    transition: 'all 0.15s ease-out',
    letterSpacing: '-0.01em',
  });

  /* ─── Render ─── */
  return (
    <div style={containerStyle}>
      {/* Tab row */}
      <div style={tabRowStyle}>
        <button style={tabStyle(mode === 'visual')} onClick={() => switchMode('visual')}>
          ✏️ Visual
        </button>
        <button style={tabStyle(mode === 'html')} onClick={() => switchMode('html')}>
          {'<>'} HTML
        </button>
      </div>

      {/* ── VISUAL MODE ── */}
      {mode === 'visual' && (
        <div>
          {/* Toolbar */}
          {editor && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 2,
                padding: '6px 10px',
                borderBottom: '1px solid #f0ede8',
                background: '#fdfcfb',
              }}
            >
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBold().run()}
                active={editor.isActive('bold')}
                title="Bold (⌘B)"
              >
                <strong style={{ fontSize: '0.875rem' }}>B</strong>
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleItalic().run()}
                active={editor.isActive('italic')}
                title="Italic (⌘I)"
              >
                <em style={{ fontSize: '0.875rem' }}>I</em>
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                active={editor.isActive('underline')}
                title="Underline (⌘U)"
              >
                <span style={{ fontSize: '0.875rem', textDecoration: 'underline' }}>U</span>
              </ToolbarButton>
              <ToolbarDivider />
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                active={editor.isActive('heading', { level: 2 })}
                title="Heading 2"
              >
                <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>H2</span>
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                active={editor.isActive('heading', { level: 3 })}
                title="Heading 3"
              >
                <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>H3</span>
              </ToolbarButton>
              <ToolbarDivider />
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                active={editor.isActive('bulletList')}
                title="Bullet List"
              >
                <span style={{ fontSize: '1rem', lineHeight: 1 }}>•≡</span>
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                active={editor.isActive('orderedList')}
                title="Numbered List"
              >
                <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>1.</span>
              </ToolbarButton>
              <ToolbarDivider />
              <ToolbarButton
                onClick={setLink}
                active={editor.isActive('link')}
                title="Insert Link"
              >
                <span style={{ fontSize: '0.875rem' }}>🔗</span>
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                active={editor.isActive('blockquote')}
                title="Blockquote"
              >
                <span style={{ fontSize: '0.875rem' }}>"</span>
              </ToolbarButton>
              <ToolbarDivider />
              <ToolbarButton
                onClick={() => editor.chain().focus().undo().run()}
                active={false}
                title="Undo (⌘Z)"
              >
                <span style={{ fontSize: '0.875rem' }}>↩</span>
              </ToolbarButton>
              <ToolbarButton
                onClick={() => editor.chain().focus().redo().run()}
                active={false}
                title="Redo (⌘⇧Z)"
              >
                <span style={{ fontSize: '0.875rem' }}>↪</span>
              </ToolbarButton>
            </div>
          )}

          {/* Editor content */}
          <div
            style={{ padding: '14px 16px', minHeight: 200 }}
            onClick={() => editor?.commands.focus()}
          >
            <style>{`
              .ece-content p { margin: 0 0 12px; }
              .ece-content p:last-child { margin-bottom: 0; }
              .ece-content h2 { font-size: 1.25rem; font-weight: 700; margin: 0 0 10px; color: #111827; }
              .ece-content h3 { font-size: 1.05rem; font-weight: 700; margin: 0 0 8px; color: #111827; }
              .ece-content ul, .ece-content ol { margin: 0 0 12px; padding-left: 20px; }
              .ece-content li { margin-bottom: 4px; }
              .ece-content a { color: #6d28d9; text-decoration: underline; }
              .ece-content blockquote { margin: 0 0 12px; padding: 10px 14px; border-left: 3px solid #e5e7eb; background: #f9fafb; color: #6b7280; font-style: italic; border-radius: 0 6px 6px 0; }
              .ece-content strong { color: #111827; }
              .ece-content[data-placeholder]:empty::before {
                content: attr(data-placeholder);
                color: #9ca3af;
                font-style: italic;
                pointer-events: none;
              }
              .tiptap { outline: none; }
              .tiptap p.is-editor-empty:first-child::before {
                content: attr(data-placeholder);
                color: #9ca3af;
                font-style: italic;
                float: left;
                height: 0;
                pointer-events: none;
              }
            `}</style>
            <EditorContent
              editor={editor}
              style={{ fontSize: '0.9rem', lineHeight: 1.7, color: '#374151' }}
            />
          </div>
        </div>
      )}

      {/* ── HTML MODE ── */}
      {mode === 'html' && (
        <div style={{ display: 'flex', gap: 0 }}>
          {/* Left: textarea */}
          <div
            style={{
              flex: '0 0 50%',
              display: 'flex',
              flexDirection: 'column',
              borderRight: '1px solid #e5e7eb',
            }}
          >
            <div
              style={{
                padding: '6px 12px',
                background: '#f9fafb',
                borderBottom: '1px solid #f0ede8',
                fontSize: '0.7rem',
                fontWeight: 700,
                color: '#9ca3af',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              HTML Source
            </div>
            <textarea
              ref={textareaRef}
              value={rawHtml}
              onChange={handleRawChange}
              placeholder={`Paste your compiled HTML here.\n\nOr write raw HTML directly:\n\n<h2>Hey {first_name}!</h2>\n<p>We're rebuilding the {chapter} alumni network...</p>\n<p><a href="{signup_link}">Claim your profile →</a></p>\n\nVariables: {first_name} {last_name} {chapter} {signup_link}`}
              spellCheck={false}
              style={{
                flex: 1,
                width: '100%',
                minHeight: 320,
                padding: '12px 14px',
                border: 'none',
                outline: 'none',
                resize: 'none',
                fontSize: '0.8rem',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                lineHeight: 1.6,
                color: '#374151',
                background: '#fafafa',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Right: live preview */}
          <div
            style={{
              flex: '0 0 50%',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: '6px 12px',
                background: '#f9fafb',
                borderBottom: '1px solid #f0ede8',
                fontSize: '0.7rem',
                fontWeight: 700,
                color: '#9ca3af',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Eye size={11} />
              Live Preview
              <span style={{ fontWeight: 400, color: '#d1d5db', textTransform: 'none', letterSpacing: 0 }}>
                · updates as you type
              </span>
            </div>
            {debouncedPreview ? (
              <iframe
                key={debouncedPreview}
                srcDoc={buildEmailPreview(debouncedPreview)}
                sandbox="allow-same-origin"
                style={{
                  flex: 1,
                  width: '100%',
                  minHeight: 320,
                  border: 'none',
                  background: '#f9fafb',
                  display: 'block',
                }}
                title="Email Preview"
              />
            ) : (
              <div
                style={{
                  flex: 1,
                  minHeight: 320,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  color: '#d1d5db',
                  background: '#f9fafb',
                }}
              >
                <Eye size={28} style={{ opacity: 0.4 }} />
                <span style={{ fontSize: '0.8125rem', color: '#9ca3af' }}>
                  Preview appears here as you type
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
