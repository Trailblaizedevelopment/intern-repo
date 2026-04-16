// TODO: migrate channels/content/schedule to Supabase tables
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Share2,
  Instagram,
  Linkedin,
  Youtube,
  Plus,
  X,
  Trash2,
  Edit2,
  ChevronRight,
  ChevronDown,
  Calendar,
  Clock,
  Link as LinkIcon,
  Users,
  Image as ImageIcon,
  Video,
  FileText,
  Type,
  Newspaper,
  Megaphone,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Platform = 'Instagram' | 'LinkedIn' | 'TikTok' | 'Twitter/X' | 'YouTube' | 'Facebook';
type ContentType = 'Photo' | 'Video' | 'Graphic' | 'Copy' | 'Post' | 'Campaign';
type KanbanColumn = 'Ideas' | 'In Progress' | 'Scheduled' | 'Done';
type Assignee = 'Owen' | 'Ford' | 'Adam' | 'Katie' | 'Unassigned';
type PostStatus = 'Scheduled' | 'Posted';

interface Channel {
  platform: Platform;
  active: boolean;
  followers: string;
  lastPost: string;
}

interface ContentCard {
  id: string;
  title: string;
  type: ContentType;
  assignee: Assignee;
  dueDate: string;
  notes: string;
  column: KanbanColumn;
}

interface ScheduledPost {
  id: string;
  platform: Platform;
  scheduledAt: string;
  caption: string;
  link: string;
  status: PostStatus;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORMS: Platform[] = ['Instagram', 'LinkedIn', 'TikTok', 'Twitter/X', 'YouTube', 'Facebook'];
const COLUMNS: KanbanColumn[] = ['Ideas', 'In Progress', 'Scheduled', 'Done'];
const ASSIGNEES: Assignee[] = ['Owen', 'Ford', 'Adam', 'Katie', 'Unassigned'];
const CONTENT_TYPES: ContentType[] = ['Photo', 'Video', 'Graphic', 'Copy', 'Post', 'Campaign'];

const TYPE_COLORS: Record<ContentType, { bg: string; color: string }> = {
  Photo:    { bg: '#dbeafe', color: '#1d4ed8' },
  Video:    { bg: '#ede9fe', color: '#7c3aed' },
  Graphic:  { bg: '#fce7f3', color: '#be185d' },
  Copy:     { bg: '#fef3c7', color: '#92400e' },
  Post:     { bg: '#d1fae5', color: '#065f46' },
  Campaign: { bg: '#fee2e2', color: '#991b1b' },
};

const PLATFORM_COLORS: Record<Platform, { bg: string; color: string; initials: string }> = {
  Instagram:  { bg: '#fce7f3', color: '#be185d', initials: 'IG' },
  LinkedIn:   { bg: '#dbeafe', color: '#1d4ed8', initials: 'LI' },
  TikTok:     { bg: '#f3f4f6', color: '#111827', initials: 'TT' },
  'Twitter/X':{ bg: '#e0f2fe', color: '#0369a1', initials: 'X' },
  YouTube:    { bg: '#fee2e2', color: '#991b1b', initials: 'YT' },
  Facebook:   { bg: '#eff6ff', color: '#1e40af', initials: 'FB' },
};

const COLUMN_COLORS: Record<KanbanColumn, { header: string; dot: string }> = {
  'Ideas':       { header: '#f3f4f6', dot: '#6b7280' },
  'In Progress': { header: '#fef3c7', dot: '#d97706' },
  'Scheduled':   { header: '#dbeafe', dot: '#2563eb' },
  'Done':        { header: '#d1fae5', dot: '#059669' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function defaultChannels(): Channel[] {
  return PLATFORMS.map(p => ({ platform: p, active: false, followers: '', lastPost: '' }));
}

function PlatformIcon({ platform, size = 18 }: { platform: Platform; size?: number }) {
  if (platform === 'Instagram') return <Instagram size={size} />;
  if (platform === 'LinkedIn')  return <Linkedin  size={size} />;
  if (platform === 'YouTube')   return <Youtube   size={size} />;
  const { initials, bg, color } = PLATFORM_COLORS[platform];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size + 6, height: size + 6, borderRadius: '50%',
      background: bg, color, fontWeight: 700, fontSize: size * 0.6,
    }}>
      {initials}
    </span>
  );
}

function TypeBadge({ type }: { type: ContentType }) {
  const { bg, color } = TYPE_COLORS[type];
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 9999,
      fontSize: '0.7rem', fontWeight: 600, background: bg, color,
    }}>
      {type}
    </span>
  );
}

function PlatformBadge({ platform }: { platform: Platform }) {
  const { bg, color } = PLATFORM_COLORS[platform];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 9999,
      fontSize: '0.7rem', fontWeight: 600, background: bg, color,
    }}>
      <PlatformIcon platform={platform} size={12} />
      {platform}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SocialsPage() {
  // ── Channels ────────────────────────────────────────────────────────────────
  const [channels, setChannels] = useState<Channel[]>(defaultChannels);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('tb_socials_channels');
      if (saved) setChannels(JSON.parse(saved));
    } catch {}
  }, []);

  const saveChannels = useCallback((next: Channel[]) => {
    setChannels(next);
    localStorage.setItem('tb_socials_channels', JSON.stringify(next));
  }, []);

  function updateChannel(i: number, patch: Partial<Channel>) {
    const next = channels.map((c, idx) => idx === i ? { ...c, ...patch } : c);
    saveChannels(next);
  }

  // ── Content Board ───────────────────────────────────────────────────────────
  const [cards, setCards] = useState<ContentCard[]>([]);
  const [addingCard, setAddingCard] = useState<KanbanColumn | null>(null);
  const [editingCard, setEditingCard] = useState<ContentCard | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [cardForm, setCardForm] = useState<Omit<ContentCard, 'id' | 'column'>>({
    title: '', type: 'Post', assignee: 'Unassigned', dueDate: '', notes: '',
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem('tb_socials_content');
      if (saved) setCards(JSON.parse(saved));
    } catch {}
  }, []);

  const saveCards = useCallback((next: ContentCard[]) => {
    setCards(next);
    localStorage.setItem('tb_socials_content', JSON.stringify(next));
  }, []);

  function openAddCard(col: KanbanColumn) {
    setCardForm({ title: '', type: 'Post', assignee: 'Unassigned', dueDate: '', notes: '' });
    setEditingCard(null);
    setAddingCard(col);
  }

  function openEditCard(card: ContentCard) {
    setCardForm({ title: card.title, type: card.type, assignee: card.assignee, dueDate: card.dueDate, notes: card.notes });
    setEditingCard(card);
    setAddingCard(card.column);
  }

  function saveCard() {
    if (!cardForm.title.trim()) return;
    if (editingCard) {
      saveCards(cards.map(c => c.id === editingCard.id ? { ...c, ...cardForm } : c));
    } else {
      saveCards([...cards, { id: uid(), column: addingCard!, ...cardForm }]);
    }
    setAddingCard(null);
    setEditingCard(null);
  }

  function deleteCard(id: string) {
    saveCards(cards.filter(c => c.id !== id));
  }

  function moveCard(id: string, col: KanbanColumn) {
    saveCards(cards.map(c => c.id === id ? { ...c, column: col } : c));
  }

  function toggleNotes(id: string) {
    setExpandedNotes(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Scheduled Posts ─────────────────────────────────────────────────────────
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [showPostForm, setShowPostForm] = useState(false);
  const [editingPost, setEditingPost] = useState<ScheduledPost | null>(null);
  const [postForm, setPostForm] = useState<Omit<ScheduledPost, 'id' | 'status'>>({
    platform: 'Instagram', scheduledAt: '', caption: '', link: '',
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem('tb_socials_schedule');
      if (saved) setPosts(JSON.parse(saved));
    } catch {}
  }, []);

  const savePosts = useCallback((next: ScheduledPost[]) => {
    setPosts(next);
    localStorage.setItem('tb_socials_schedule', JSON.stringify(next));
  }, []);

  function openAddPost() {
    setPostForm({ platform: 'Instagram', scheduledAt: '', caption: '', link: '' });
    setEditingPost(null);
    setShowPostForm(true);
  }

  function openEditPost(post: ScheduledPost) {
    setPostForm({ platform: post.platform, scheduledAt: post.scheduledAt, caption: post.caption, link: post.link });
    setEditingPost(post);
    setShowPostForm(true);
  }

  function savePost() {
    if (!postForm.caption.trim() || !postForm.scheduledAt) return;
    if (editingPost) {
      savePosts(posts.map(p => p.id === editingPost.id ? { ...p, ...postForm } : p));
    } else {
      savePosts([...posts, { id: uid(), status: 'Scheduled', ...postForm }]);
    }
    setShowPostForm(false);
    setEditingPost(null);
  }

  function deletePost(id: string) {
    savePosts(posts.filter(p => p.id !== id));
  }

  function togglePostStatus(id: string) {
    savePosts(posts.map(p => p.id === id ? { ...p, status: p.status === 'Scheduled' ? 'Posted' : 'Scheduled' } : p));
  }

  const sortedPosts = [...posts].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="module-page">
      {/* Header */}
      <header className="module-header">
        <div className="module-header-content">
          <div className="module-title-row">
            <div className="module-icon" style={{ backgroundColor: '#ede9fe', color: '#7c3aed' }}>
              <Share2 size={24} />
            </div>
            <div>
              <h1>Socials</h1>
              <p>Marketing, content, and social media command center</p>
            </div>
          </div>
        </div>
      </header>

      <main className="module-main">

        {/* ── Section 1: Channels ─────────────────────────────────────────── */}
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#0F172A', marginBottom: '1rem' }}>
            Channels
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '1rem',
          }}>
            {channels.map((ch, i) => {
              const { bg, color } = PLATFORM_COLORS[ch.platform];
              return (
                <div key={ch.platform} style={{
                  background: '#fff',
                  border: '1px solid #E5E7EB',
                  borderRadius: 14,
                  padding: '1.1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.65rem',
                }}>
                  {/* Platform header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: bg, color, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <PlatformIcon platform={ch.platform} size={18} />
                    </div>
                    <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0F172A' }}>
                      {ch.platform}
                    </span>
                    {/* Status toggle */}
                    <button
                      onClick={() => updateChannel(i, { active: !ch.active })}
                      style={{
                        marginLeft: 'auto',
                        padding: '2px 10px',
                        borderRadius: 9999,
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        border: 'none',
                        cursor: 'pointer',
                        background: ch.active ? '#d1fae5' : '#f3f4f6',
                        color: ch.active ? '#065f46' : '#6b7280',
                        transition: 'all 0.15s',
                      }}
                    >
                      {ch.active ? 'Active' : 'Inactive'}
                    </button>
                  </div>

                  {/* Followers */}
                  <div>
                    <label style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 500, display: 'block', marginBottom: 3 }}>
                      Followers
                    </label>
                    <input
                      type="text"
                      value={ch.followers}
                      onChange={e => updateChannel(i, { followers: e.target.value })}
                      placeholder="e.g. 2,400"
                      style={{
                        width: '100%', padding: '5px 8px',
                        border: '1px solid #E5E7EB', borderRadius: 8,
                        fontSize: '0.8125rem', outline: 'none',
                        background: '#F9FAFB',
                      }}
                    />
                  </div>

                  {/* Last post */}
                  <div>
                    <label style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 500, display: 'block', marginBottom: 3 }}>
                      Last Post
                    </label>
                    <input
                      type="date"
                      value={ch.lastPost}
                      onChange={e => updateChannel(i, { lastPost: e.target.value })}
                      style={{
                        width: '100%', padding: '5px 8px',
                        border: '1px solid #E5E7EB', borderRadius: 8,
                        fontSize: '0.8125rem', outline: 'none',
                        background: '#F9FAFB',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Section 2: Content Board ─────────────────────────────────────── */}
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#0F172A', marginBottom: '1rem' }}>
            Content Board
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '1rem',
            overflowX: 'auto',
          }}>
            {COLUMNS.map(col => {
              const colCards = cards.filter(c => c.column === col);
              const { header, dot } = COLUMN_COLORS[col];
              const isAdding = addingCard === col && !editingCard;

              return (
                <div key={col} style={{
                  background: '#F9FAFB',
                  border: '1px solid #E5E7EB',
                  borderRadius: 14,
                  overflow: 'hidden',
                  minWidth: 220,
                }}>
                  {/* Column header */}
                  <div style={{
                    padding: '0.75rem 1rem',
                    background: header,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    borderBottom: '1px solid #E5E7EB',
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#0F172A', flex: 1 }}>{col}</span>
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 600, color: '#6b7280',
                      background: '#fff', borderRadius: 9999, padding: '1px 7px',
                      border: '1px solid #E5E7EB',
                    }}>{colCards.length}</span>
                  </div>

                  {/* Cards */}
                  <div style={{ padding: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {colCards.map(card => (
                      <div key={card.id} style={{
                        background: '#fff',
                        border: '1px solid #E5E7EB',
                        borderRadius: 10,
                        padding: '0.7rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.45rem',
                      }}>
                        {/* Card title row */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                          <span style={{ flex: 1, fontWeight: 500, fontSize: '0.8125rem', color: '#0F172A', lineHeight: 1.4 }}>
                            {card.title}
                          </span>
                          <button
                            onClick={() => openEditCard(card)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 2 }}
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => deleteCard(card.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        {/* Badges row */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center' }}>
                          <TypeBadge type={card.type} />
                          {card.assignee !== 'Unassigned' && (
                            <span style={{
                              fontSize: '0.7rem', color: '#6b7280', fontWeight: 500,
                              background: '#f3f4f6', borderRadius: 9999, padding: '2px 7px',
                            }}>
                              {card.assignee}
                            </span>
                          )}
                          {card.dueDate && (
                            <span style={{
                              fontSize: '0.7rem', color: '#6b7280',
                              display: 'inline-flex', alignItems: 'center', gap: 3,
                            }}>
                              <Calendar size={10} /> {card.dueDate}
                            </span>
                          )}
                        </div>

                        {/* Notes toggle */}
                        {card.notes && (
                          <div>
                            <button
                              onClick={() => toggleNotes(card.id)}
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                fontSize: '0.7rem', color: '#6b7280', padding: 0,
                                display: 'flex', alignItems: 'center', gap: 3,
                              }}
                            >
                              {expandedNotes.has(card.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                              Notes
                            </button>
                            {expandedNotes.has(card.id) && (
                              <p style={{
                                fontSize: '0.75rem', color: '#6b7280',
                                marginTop: '0.3rem', lineHeight: 1.5,
                                background: '#F9FAFB', borderRadius: 6,
                                padding: '0.4rem 0.5rem',
                              }}>
                                {card.notes}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Move to */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Move →</span>
                          <select
                            value={card.column}
                            onChange={e => moveCard(card.id, e.target.value as KanbanColumn)}
                            style={{
                              fontSize: '0.7rem', padding: '2px 5px',
                              border: '1px solid #E5E7EB', borderRadius: 6,
                              background: '#fff', color: '#374151', cursor: 'pointer',
                              outline: 'none',
                            }}
                          >
                            {COLUMNS.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      </div>
                    ))}

                    {/* Inline add/edit form */}
                    {addingCard === col && (
                      <div style={{
                        background: '#fff',
                        border: '1px solid #3b82f6',
                        borderRadius: 10,
                        padding: '0.75rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                      }}>
                        <input
                          autoFocus
                          type="text"
                          value={cardForm.title}
                          onChange={e => setCardForm(f => ({ ...f, title: e.target.value }))}
                          placeholder="Card title..."
                          style={{
                            width: '100%', padding: '5px 8px',
                            border: '1px solid #E5E7EB', borderRadius: 7,
                            fontSize: '0.8125rem', outline: 'none',
                          }}
                        />
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <select
                            value={cardForm.type}
                            onChange={e => setCardForm(f => ({ ...f, type: e.target.value as ContentType }))}
                            style={{ flex: 1, fontSize: '0.75rem', padding: '4px 6px', border: '1px solid #E5E7EB', borderRadius: 7, outline: 'none' }}
                          >
                            {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <select
                            value={cardForm.assignee}
                            onChange={e => setCardForm(f => ({ ...f, assignee: e.target.value as Assignee }))}
                            style={{ flex: 1, fontSize: '0.75rem', padding: '4px 6px', border: '1px solid #E5E7EB', borderRadius: 7, outline: 'none' }}
                          >
                            {ASSIGNEES.map(a => <option key={a} value={a}>{a}</option>)}
                          </select>
                        </div>
                        <input
                          type="date"
                          value={cardForm.dueDate}
                          onChange={e => setCardForm(f => ({ ...f, dueDate: e.target.value }))}
                          style={{ width: '100%', padding: '5px 8px', border: '1px solid #E5E7EB', borderRadius: 7, fontSize: '0.75rem', outline: 'none' }}
                        />
                        <textarea
                          value={cardForm.notes}
                          onChange={e => setCardForm(f => ({ ...f, notes: e.target.value }))}
                          placeholder="Notes (optional)..."
                          rows={2}
                          style={{
                            width: '100%', padding: '5px 8px',
                            border: '1px solid #E5E7EB', borderRadius: 7,
                            fontSize: '0.75rem', outline: 'none', resize: 'vertical',
                          }}
                        />
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button
                            onClick={saveCard}
                            disabled={!cardForm.title.trim()}
                            style={{
                              flex: 1, padding: '5px 0',
                              background: cardForm.title.trim() ? '#0F172A' : '#e5e7eb',
                              color: cardForm.title.trim() ? '#fff' : '#9ca3af',
                              border: 'none', borderRadius: 7,
                              fontSize: '0.75rem', fontWeight: 600,
                              cursor: cardForm.title.trim() ? 'pointer' : 'default',
                            }}
                          >
                            {editingCard ? 'Update' : 'Add'}
                          </button>
                          <button
                            onClick={() => { setAddingCard(null); setEditingCard(null); }}
                            style={{
                              padding: '5px 10px',
                              background: '#f3f4f6', color: '#6b7280',
                              border: 'none', borderRadius: 7,
                              fontSize: '0.75rem', cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Add card button */}
                    {addingCard !== col && (
                      <button
                        onClick={() => openAddCard(col)}
                        style={{
                          width: '100%', padding: '6px 0',
                          background: 'none', border: '1px dashed #D1D5DB',
                          borderRadius: 8, cursor: 'pointer',
                          color: '#9ca3af', fontSize: '0.75rem',
                          display: 'flex', alignItems: 'center',
                          justifyContent: 'center', gap: '0.3rem',
                          transition: 'all 0.15s',
                        }}
                      >
                        <Plus size={13} /> Add card
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Section 3: Scheduled Posts ───────────────────────────────────── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#0F172A' }}>
              Scheduled Posts
            </h2>
            <button className="module-primary-btn" onClick={openAddPost}>
              <Plus size={16} /> Add Post
            </button>
          </div>

          {/* Inline post form */}
          {showPostForm && (
            <div style={{
              background: '#fff', border: '1px solid #3b82f6',
              borderRadius: 14, padding: '1.25rem',
              marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#0F172A' }}>
                  {editingPost ? 'Edit Post' : 'New Scheduled Post'}
                </span>
                <button
                  onClick={() => { setShowPostForm(false); setEditingPost(null); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}
                >
                  <X size={18} />
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="module-form-group" style={{ margin: 0 }}>
                  <label>Platform</label>
                  <select
                    value={postForm.platform}
                    onChange={e => setPostForm(f => ({ ...f, platform: e.target.value as Platform }))}
                  >
                    {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="module-form-group" style={{ margin: 0 }}>
                  <label>Scheduled Date & Time</label>
                  <input
                    type="datetime-local"
                    value={postForm.scheduledAt}
                    onChange={e => setPostForm(f => ({ ...f, scheduledAt: e.target.value }))}
                  />
                </div>
              </div>
              <div className="module-form-group" style={{ margin: 0 }}>
                <label>Caption</label>
                <textarea
                  value={postForm.caption}
                  onChange={e => setPostForm(f => ({ ...f, caption: e.target.value }))}
                  placeholder="Write your caption..."
                  rows={3}
                  style={{ resize: 'vertical' }}
                />
              </div>
              <div className="module-form-group" style={{ margin: 0 }}>
                <label>Link (optional)</label>
                <input
                  type="url"
                  value={postForm.link}
                  onChange={e => setPostForm(f => ({ ...f, link: e.target.value }))}
                  placeholder="https://..."
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button
                  className="module-cancel-btn"
                  onClick={() => { setShowPostForm(false); setEditingPost(null); }}
                >
                  Cancel
                </button>
                <button
                  className="module-primary-btn"
                  onClick={savePost}
                  disabled={!postForm.caption.trim() || !postForm.scheduledAt}
                >
                  {editingPost ? 'Update' : 'Schedule Post'}
                </button>
              </div>
            </div>
          )}

          {/* Posts list */}
          <div className="module-table-container">
            {sortedPosts.length === 0 ? (
              <div className="module-empty-state">
                <Calendar size={40} />
                <h3>No scheduled posts yet</h3>
                <p>Add a post to start planning your content calendar.</p>
              </div>
            ) : (
              <table className="module-table">
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Platform</th>
                    <th>Caption</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPosts.map(post => (
                    <tr key={post.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#374151' }}>
                          <Calendar size={13} />
                          {post.scheduledAt
                            ? new Date(post.scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : '—'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#9ca3af', fontSize: '0.75rem', marginTop: 2 }}>
                          <Clock size={11} />
                          {post.scheduledAt
                            ? new Date(post.scheduledAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                            : ''}
                        </div>
                      </td>
                      <td><PlatformBadge platform={post.platform} /></td>
                      <td style={{ maxWidth: 320 }}>
                        <p style={{
                          overflow: 'hidden', textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap', fontSize: '0.8125rem',
                          color: '#374151', margin: 0,
                        }} title={post.caption}>
                          {post.caption}
                        </p>
                        {post.link && (
                          <a href={post.link} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: '0.7rem', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}
                          >
                            <LinkIcon size={10} /> {post.link}
                          </a>
                        )}
                      </td>
                      <td>
                        <button
                          onClick={() => togglePostStatus(post.id)}
                          style={{
                            padding: '3px 10px', borderRadius: 9999,
                            fontSize: '0.72rem', fontWeight: 600,
                            border: 'none', cursor: 'pointer',
                            background: post.status === 'Posted' ? '#d1fae5' : '#dbeafe',
                            color: post.status === 'Posted' ? '#065f46' : '#1d4ed8',
                          }}
                        >
                          {post.status}
                        </button>
                      </td>
                      <td>
                        <div className="module-table-actions">
                          <button
                            className="module-table-action"
                            title="Edit"
                            onClick={() => openEditPost(post)}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            className="module-table-action delete"
                            title="Delete"
                            onClick={() => deletePost(post.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
