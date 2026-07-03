'use client';

import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Loader2, Pencil } from 'lucide-react';

function isHtmlContent(content: string): boolean {
  return /<[a-z][\s\S]*>/i.test(content);
}

interface MarkdownDisplayProps {
  content: string;
  className?: string;
}

export function MarkdownDisplay({ content, className = '' }: MarkdownDisplayProps) {
  if (!content.trim()) return null;

  if (isHtmlContent(content)) {
    return (
      <div
        className={`md-display rte-display ${className}`.trim()}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }

  return (
    <div className={`md-display rte-display ${className}`.trim()}>
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}

interface MarkdownEditorProps {
  value: string;
  onSave: (value: string) => Promise<void> | void;
  placeholder?: string;
  disabled?: boolean;
}

export function MarkdownEditor({
  value,
  onSave,
  placeholder = 'Write a description… Markdown supported.',
  disabled = false,
}: MarkdownEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const startEditing = () => {
    if (disabled) return;
    setDraft(value);
    setEditing(true);
  };

  const cancelEditing = () => {
    setDraft(value);
    setEditing(false);
  };

  const save = async () => {
    if (draft === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="md-editor md-editor--view">
        {value.trim() ? (
          <button type="button" className="md-editor__surface" onClick={startEditing} disabled={disabled}>
            <MarkdownDisplay content={value} />
          </button>
        ) : (
          <button type="button" className="md-editor__empty" onClick={startEditing} disabled={disabled}>
            {placeholder}
          </button>
        )}
        {!disabled && value.trim() && (
          <button type="button" className="md-editor__edit-btn" onClick={startEditing} aria-label="Edit description">
            <Pencil size={13} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="md-editor md-editor--edit">
      <textarea
        className="md-editor__textarea"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        placeholder={placeholder}
        rows={8}
        autoFocus
      />
      <div className="md-editor__preview-pane">
        <span className="md-editor__preview-label">Preview</span>
        {draft.trim() ? (
          <MarkdownDisplay content={draft} />
        ) : (
          <p className="md-editor__preview-empty">Nothing to preview yet.</p>
        )}
      </div>
      <div className="md-editor__actions">
        <button type="button" className="md-editor__btn md-editor__btn--ghost" onClick={cancelEditing} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="md-editor__btn md-editor__btn--primary" onClick={save} disabled={saving}>
          {saving ? <Loader2 size={14} className="tkt__spinner" /> : 'Save'}
        </button>
      </div>
    </div>
  );
}
