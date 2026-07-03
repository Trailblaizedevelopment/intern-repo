'use client';

import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import React, { useCallback, useEffect } from 'react';

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  editable?: boolean;
}

const MenuBar = ({ editor }: { editor: Editor }) => {
  const setLink = useCallback(() => {
    const url = window.prompt('URL');
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  return (
    <div className="rte-toolbar">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={editor.isActive('bold') ? 'active' : ''}
        title="Bold"
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={editor.isActive('italic') ? 'active' : ''}
        title="Italic"
      >
        <em>I</em>
      </button>
      <span className="rte-divider" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={editor.isActive('heading', { level: 3 }) ? 'active' : ''}
        title="Heading"
      >
        H
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={editor.isActive('bulletList') ? 'active' : ''}
        title="Bullet List"
      >
        &bull;
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={editor.isActive('orderedList') ? 'active' : ''}
        title="Numbered List"
      >
        1.
      </button>
      <span className="rte-divider" />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        className={editor.isActive('codeBlock') ? 'active' : ''}
        title="Code Block"
      >
        {'</>'}
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={editor.isActive('blockquote') ? 'active' : ''}
        title="Quote"
      >
        &ldquo;
      </button>
      <button
        type="button"
        onClick={setLink}
        className={editor.isActive('link') ? 'active' : ''}
        title="Link"
      >
        &#128279;
      </button>
    </div>
  );
};

export function RichTextEditor({ content, onChange, placeholder, editable = true }: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'rte-content',
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
      },
    },
  });

  useEffect(() => {
    if (editor && !editable) {
      editor.setEditable(false);
    }
  }, [editor, editable]);

  if (!editor) return null;

  if (!editable) {
    return <EditorContent editor={editor} className="rte rte--readonly" />;
  }

  return (
    <div className="rte">
      <MenuBar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

/**
 * Read-only renderer for rich text content (HTML string).
 * Falls back to plain-text wrapping if content has no HTML tags.
 */
export function RichTextDisplay({ content }: { content: string }) {
  const isHTML = /<[a-z][\s\S]*>/i.test(content);

  if (!isHTML) {
    return (
      <div className="rte-display rte-display--plain">
        {content.split('\n').map((line, i) => (
          <p key={i}>{line || '\u00A0'}</p>
        ))}
      </div>
    );
  }

  return (
    <div
      className="rte-display"
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
