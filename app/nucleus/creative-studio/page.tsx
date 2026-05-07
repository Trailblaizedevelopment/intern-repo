'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  Flame,
  Trophy,
  Calendar,
  TrendingUp,
  Camera,
  Bot,
  Image as ImageIcon,
  Check,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';

// ─── Constants ─────────────────────────────────────────────────────────────

const EXPERIMENT_START = new Date('2026-05-09');
const EXPERIMENT_END = new Date('2026-06-05');
const TOTAL_DAYS = 28;
const POSTS_PER_TYPE = 5;
const TYPES_PER_DAY = 3;
const TOTAL_TARGET = TOTAL_DAYS * POSTS_PER_TYPE * TYPES_PER_DAY; // 420

type ContentType = 'real_person' | 'ai_influencer' | 'ai_pictures';

interface ContentTypeConfig {
  key: ContentType;
  label: string;
  emoji: string;
  icon: React.ReactNode;
}

const CONTENT_TYPES: ContentTypeConfig[] = [
  { key: 'real_person', label: 'Real Person (Tom)', emoji: '🎥', icon: <Camera size={14} /> },
  { key: 'ai_influencer', label: 'AI Influencer', emoji: '🤖', icon: <Bot size={14} /> },
  { key: 'ai_pictures', label: 'AI Pictures / Reels', emoji: '🖼️', icon: <ImageIcon size={14} /> },
];

interface CreativePost {
  id: string;
  post_date: string;
  content_type: ContentType;
  caption?: string;
  link?: string;
  notes?: string;
  created_at: string;
}

interface DayData {
  date: Date;
  dateStr: string; // YYYY-MM-DD
  counts: Record<ContentType, number>;
  posts: Record<ContentType, CreativePost[]>;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatDateStr(date: Date): string {
  return date.toISOString().split('T')[0];
}

function todayStr(): string {
  return formatDateStr(new Date());
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function buildDays(): DayData[] {
  const days: DayData[] = [];
  for (let i = 0; i < TOTAL_DAYS; i++) {
    const date = addDays(EXPERIMENT_START, i);
    const dateStr = formatDateStr(date);
    days.push({
      date,
      dateStr,
      counts: { real_person: 0, ai_influencer: 0, ai_pictures: 0 },
      posts: { real_person: [], ai_influencer: [], ai_pictures: [] },
    });
  }
  return days;
}

function injectPosts(days: DayData[], posts: CreativePost[]): DayData[] {
  const dayMap: Record<string, DayData> = {};
  days.forEach(d => { dayMap[d.dateStr] = { ...d, counts: { real_person: 0, ai_influencer: 0, ai_pictures: 0 }, posts: { real_person: [], ai_influencer: [], ai_pictures: [] } }; });
  posts.forEach(p => {
    const day = dayMap[p.post_date];
    if (day) {
      day.posts[p.content_type].push(p);
      day.counts[p.content_type]++;
    }
  });
  return days.map(d => dayMap[d.dateStr] || d);
}

function dayTotal(day: DayData): number {
  return day.counts.real_person + day.counts.ai_influencer + day.counts.ai_pictures;
}

function getDayStatus(day: DayData): 'complete' | 'partial' | 'empty' | 'future' | 'today' {
  const today = todayStr();
  const total = dayTotal(day);
  const isToday = day.dateStr === today;
  const isPast = day.dateStr < today;
  if (isToday) return 'today';
  if (!isPast) return 'future';
  if (total >= 15) return 'complete';
  if (total > 0) return 'partial';
  return 'empty';
}

function computeStreak(days: DayData[]): number {
  const today = todayStr();
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i];
    if (d.dateStr > today) continue;
    if (dayTotal(d) >= 15) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

function computeBestDay(days: DayData[]): number {
  return Math.max(0, ...days.map(dayTotal));
}

function daysRemaining(): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(EXPERIMENT_END);
  end.setHours(0, 0, 0, 0);
  const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

function formatDayLabel(date: Date): string {
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const day = date.getDate();
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
  return `${month} ${day} — ${weekday}`;
}

// ─── Components ────────────────────────────────────────────────────────────

interface CounterProps {
  value: number;
  max?: number;
  onIncrement: () => void;
  onDecrement: () => void;
  disabled?: boolean;
}

function Counter({ value, max = 5, onIncrement, onDecrement, disabled }: CounterProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button
        onClick={onDecrement}
        disabled={disabled || value <= 0}
        style={{
          width: 22, height: 22, borderRadius: 6,
          border: '1px solid #E5E7EB', background: '#F9FAFB',
          cursor: value <= 0 || disabled ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#6B7280', fontSize: 14, lineHeight: 1,
          opacity: value <= 0 || disabled ? 0.4 : 1,
          flexShrink: 0,
        }}
      >−</button>
      <span style={{
        minWidth: 16, textAlign: 'center', fontSize: '0.8125rem',
        fontWeight: 600, color: value >= max ? '#059669' : '#111827',
      }}>{value}</span>
      <button
        onClick={onIncrement}
        disabled={disabled || value >= max}
        style={{
          width: 22, height: 22, borderRadius: 6,
          border: '1px solid #E5E7EB', background: '#F9FAFB',
          cursor: value >= max || disabled ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#6B7280', fontSize: 14, lineHeight: 1,
          opacity: value >= max || disabled ? 0.4 : 1,
          flexShrink: 0,
        }}
      >+</button>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function CreativeStudioPage() {
  const [posts, setPosts] = useState<CreativePost[]>([]);
  const [days, setDays] = useState<DayData[]>(buildDays());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null); // 'dateStr-type'

  // Log Post modal
  const [showModal, setShowModal] = useState(false);
  const [modalDate, setModalDate] = useState(todayStr());
  const [modalType, setModalType] = useState<ContentType>('real_person');
  const [modalCaption, setModalCaption] = useState('');
  const [modalLink, setModalLink] = useState('');
  const [modalNotes, setModalNotes] = useState('');
  const [modalSaving, setModalSaving] = useState(false);

  // Expanded day detail
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/creative-posts?start_date=2026-05-09&end_date=2026-06-05');
      const json = await res.json();
      if (!json.error && Array.isArray(json.data)) {
        setPosts(json.data);
        setDays(injectPosts(buildDays(), json.data));
      }
    } catch (err) {
      console.error('Error fetching posts:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  // Quick +/- handler: create or delete a post for a type/date
  async function handleIncrement(dateStr: string, type: ContentType) {
    const key = `${dateStr}-${type}`;
    setSaving(key);
    try {
      const res = await fetch('/api/creative-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_date: dateStr, content_type: type }),
      });
      const json = await res.json();
      if (!json.error && json.data) {
        const newPost = json.data as CreativePost;
        const updated = [...posts, newPost];
        setPosts(updated);
        setDays(injectPosts(buildDays(), updated));
      }
    } catch (err) {
      console.error('Error adding post:', err);
    }
    setSaving(null);
  }

  async function handleDecrement(dateStr: string, type: ContentType) {
    const day = days.find(d => d.dateStr === dateStr);
    if (!day) return;
    const typePosts = day.posts[type];
    if (!typePosts.length) return;
    // Delete the most recent post of this type
    const target = typePosts[typePosts.length - 1];
    const key = `${dateStr}-${type}`;
    setSaving(key);
    try {
      const res = await fetch(`/api/creative-posts?id=${target.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.error) {
        const updated = posts.filter(p => p.id !== target.id);
        setPosts(updated);
        setDays(injectPosts(buildDays(), updated));
      }
    } catch (err) {
      console.error('Error removing post:', err);
    }
    setSaving(null);
  }

  async function handleModalSave() {
    if (!modalDate || !modalType) return;
    setModalSaving(true);
    try {
      const res = await fetch('/api/creative-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_date: modalDate,
          content_type: modalType,
          caption: modalCaption || undefined,
          link: modalLink || undefined,
          notes: modalNotes || undefined,
        }),
      });
      const json = await res.json();
      if (!json.error && json.data) {
        const newPost = json.data as CreativePost;
        const updated = [...posts, newPost];
        setPosts(updated);
        setDays(injectPosts(buildDays(), updated));
        setShowModal(false);
        setModalCaption('');
        setModalLink('');
        setModalNotes('');
      }
    } catch (err) {
      console.error('Error saving post:', err);
    }
    setModalSaving(false);
  }

  // Stats
  const totalPosted = posts.length;
  const streak = computeStreak(days);
  const bestDay = computeBestDay(days);
  const remaining = daysRemaining();
  const progressPct = Math.min(100, Math.round((totalPosted / TOTAL_TARGET) * 100));

  const today = todayStr();

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF8', padding: '0 0 80px 0' }}>

      {/* Header */}
      <div style={{ padding: '32px 32px 0', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <Sparkles size={22} color="#059669" />
              <h1 style={{
                fontFamily: '"Instrument Serif", Georgia, serif',
                fontSize: '2rem', fontWeight: 700, color: '#111827', margin: 0,
              }}>Creative Studio</h1>
            </div>
            <p style={{ color: '#6B7280', fontSize: '0.9375rem', margin: 0 }}>
              15 posts/day · 28-day experiment · May 9 – June 5
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={fetchPosts}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 8,
                border: '1px solid #E5E7EB', background: '#fff',
                cursor: 'pointer', fontSize: '0.875rem', color: '#6B7280',
              }}
            >
              <RefreshCw size={14} />
              Refresh
            </button>
            <button
              onClick={() => {
                setModalDate(today);
                setModalType('real_person');
                setShowModal(true);
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 8,
                border: 'none', background: '#059669',
                cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, color: '#fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
              }}
            >
              <Plus size={16} />
              Log Post
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ marginTop: 24, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151' }}>
              {totalPosted} / {TOTAL_TARGET} posts
            </span>
            <span style={{ fontSize: '0.8125rem', color: '#6B7280' }}>{progressPct}%</span>
          </div>
          <div style={{ height: 10, borderRadius: 999, background: '#E5E7EB', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 999,
              background: 'linear-gradient(90deg, #059669, #10B981)',
              width: `${progressPct}%`,
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div style={{ padding: '20px 32px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Total Posted', value: `${totalPosted} / ${TOTAL_TARGET}`, icon: <TrendingUp size={18} />, color: '#059669' },
            { label: 'Current Streak', value: `${streak} day${streak !== 1 ? 's' : ''}`, icon: <Flame size={18} />, color: '#F59E0B' },
            { label: 'Best Day', value: `${bestDay} posts`, icon: <Trophy size={18} />, color: '#8B5CF6' },
            { label: 'Days Remaining', value: `${remaining} day${remaining !== 1 ? 's' : ''}`, icon: <Calendar size={18} />, color: '#3B82F6' },
          ].map(stat => (
            <div key={stat.label} style={{
              background: '#fff', borderRadius: 12,
              border: '1px solid #F3F4F6', padding: '16px 18px',
              display: 'flex', alignItems: 'center', gap: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: `${stat.color}18`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: stat.color, flexShrink: 0,
              }}>{stat.icon}</div>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#9CA3AF', fontWeight: 500, marginBottom: 2 }}>{stat.label}</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#111827' }}>{stat.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 28-Day Calendar Grid */}
      <div style={{ padding: '0 32px', maxWidth: 1200, margin: '0 auto' }}>
        <h2 style={{
          fontFamily: '"Instrument Serif", Georgia, serif',
          fontSize: '1.25rem', fontWeight: 700, color: '#111827',
          margin: '0 0 16px 0',
        }}>28-Day Tracker</h2>

        {loading ? (
          <div style={{ textAlign: 'center', color: '#9CA3AF', padding: '48px 0', fontSize: '0.9375rem' }}>
            Loading...
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            {days.map((day) => {
              const status = getDayStatus(day);
              const total = dayTotal(day);
              const isExpanded = expandedDay === day.dateStr;
              const isToday = day.dateStr === today;

              const borderColor = isToday
                ? '#059669'
                : status === 'complete' ? '#A7F3D0'
                : status === 'partial' ? '#FCD34D'
                : '#F3F4F6';

              const bgColor = status === 'complete'
                ? '#F0FDF4'
                : status === 'partial' ? '#FFFBEB'
                : '#fff';

              return (
                <div
                  key={day.dateStr}
                  style={{
                    background: bgColor,
                    border: `2px solid ${borderColor}`,
                    borderRadius: 12,
                    overflow: 'hidden',
                    transition: 'box-shadow 0.15s',
                    boxShadow: isToday ? '0 0 0 2px #059669, 0 2px 8px rgba(5,150,105,0.15)' : '0 1px 3px rgba(0,0,0,0.04)',
                    opacity: status === 'future' ? 0.6 : 1,
                  }}
                >
                  {/* Day Header */}
                  <button
                    onClick={() => setExpandedDay(isExpanded ? null : day.dateStr)}
                    style={{
                      width: '100%', padding: '10px 12px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {isToday && (
                          <span style={{
                            fontSize: '0.6rem', fontWeight: 700, background: '#059669',
                            color: '#fff', borderRadius: 4, padding: '1px 5px', textTransform: 'uppercase',
                          }}>Today</span>
                        )}
                        {status === 'complete' && <Check size={13} color="#059669" />}
                      </div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginTop: 2 }}>
                        {formatDayLabel(day.date)}
                      </div>
                    </div>
                    <div style={{
                      fontSize: '1rem', fontWeight: 700,
                      color: status === 'complete' ? '#059669' : status === 'partial' ? '#D97706' : '#9CA3AF',
                    }}>
                      {total}/15
                    </div>
                  </button>

                  {/* Content type rows */}
                  <div style={{ padding: '0 12px 10px' }}>
                    {CONTENT_TYPES.map(ct => {
                      const count = day.counts[ct.key];
                      const isSaving = saving === `${day.dateStr}-${ct.key}`;
                      const isFuture = status === 'future';
                      return (
                        <div key={ct.key} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '4px 0',
                          borderTop: '1px solid rgba(0,0,0,0.04)',
                        }}>
                          <span style={{ fontSize: '0.75rem', color: '#6B7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                            {ct.emoji} <span style={{ fontSize: '0.7rem' }}>{ct.label.split(' ')[0]} {ct.label.split(' ')[1] || ''}</span>
                          </span>
                          {isSaving ? (
                            <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>…</span>
                          ) : (
                            <Counter
                              value={count}
                              max={POSTS_PER_TYPE}
                              onIncrement={() => handleIncrement(day.dateStr, ct.key)}
                              onDecrement={() => handleDecrement(day.dateStr, ct.key)}
                              disabled={isFuture}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Expanded notes/links panel */}
                  {isExpanded && (
                    <div style={{ padding: '12px', borderTop: '1px solid #E5E7EB', background: 'rgba(0,0,0,0.02)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151' }}>Posts logged</span>
                        <button
                          onClick={() => {
                            setModalDate(day.dateStr);
                            setModalType('real_person');
                            setShowModal(true);
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '3px 8px', borderRadius: 6,
                            border: '1px solid #E5E7EB', background: '#fff',
                            cursor: 'pointer', fontSize: '0.7rem', color: '#059669', fontWeight: 600,
                          }}
                        >
                          <Plus size={10} /> Add with details
                        </button>
                      </div>
                      {posts.filter(p => p.post_date === day.dateStr).length === 0 ? (
                        <p style={{ fontSize: '0.75rem', color: '#9CA3AF', margin: 0 }}>No posts logged yet.</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {posts.filter(p => p.post_date === day.dateStr).map(post => {
                            const ct = CONTENT_TYPES.find(c => c.key === post.content_type);
                            return (
                              <div key={post.id} style={{
                                background: '#fff', borderRadius: 8, padding: '7px 10px',
                                border: '1px solid #F3F4F6', fontSize: '0.75rem',
                              }}>
                                <div style={{ fontWeight: 600, color: '#374151', marginBottom: 2 }}>
                                  {ct?.emoji} {ct?.label}
                                </div>
                                {post.caption && <div style={{ color: '#6B7280' }}>{post.caption}</div>}
                                {post.link && (
                                  <a href={post.link} target="_blank" rel="noreferrer" style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                                    <ExternalLink size={10} /> View post
                                  </a>
                                )}
                                {post.notes && <div style={{ color: '#9CA3AF', marginTop: 2, fontStyle: 'italic' }}>{post.notes}</div>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Log Post Modal */}
      {showModal && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', zIndex: 100 }}
            onClick={() => setShowModal(false)}
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            background: '#fff', borderRadius: 16,
            padding: '28px 28px 24px',
            width: 420, maxWidth: 'calc(100vw - 32px)',
            zIndex: 101, boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{
                fontFamily: '"Instrument Serif", Georgia, serif',
                fontSize: '1.25rem', fontWeight: 700, color: '#111827', margin: 0,
              }}>Log a Post</h3>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Content Type */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>Content Type</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {CONTENT_TYPES.map(ct => (
                  <button
                    key={ct.key}
                    onClick={() => setModalType(ct.key)}
                    style={{
                      flex: 1, padding: '8px 6px', borderRadius: 8, cursor: 'pointer',
                      border: `2px solid ${modalType === ct.key ? '#059669' : '#E5E7EB'}`,
                      background: modalType === ct.key ? '#F0FDF4' : '#fff',
                      fontSize: '0.75rem', fontWeight: 600,
                      color: modalType === ct.key ? '#059669' : '#6B7280',
                      textAlign: 'center',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: '1rem', marginBottom: 2 }}>{ct.emoji}</div>
                    {ct.label.split('(')[0].trim()}
                  </button>
                ))}
              </div>
            </div>

            {/* Date */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Date</label>
              <input
                type="date"
                value={modalDate}
                min="2026-05-09"
                max="2026-06-05"
                onChange={e => setModalDate(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 8,
                  border: '1px solid #E5E7EB', fontSize: '0.875rem', color: '#111827',
                  background: '#FAFAF8', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Caption */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                Caption <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                type="text"
                placeholder="Post caption or title…"
                value={modalCaption}
                onChange={e => setModalCaption(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 8,
                  border: '1px solid #E5E7EB', fontSize: '0.875rem', color: '#111827',
                  background: '#FAFAF8', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Link */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                Link <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                type="url"
                placeholder="https://instagram.com/p/…"
                value={modalLink}
                onChange={e => setModalLink(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 8,
                  border: '1px solid #E5E7EB', fontSize: '0.875rem', color: '#111827',
                  background: '#FAFAF8', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                Notes <span style={{ color: '#9CA3AF', fontWeight: 400 }}>(optional)</span>
              </label>
              <textarea
                placeholder="Any notes about this post…"
                value={modalNotes}
                onChange={e => setModalNotes(e.target.value)}
                rows={2}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 8,
                  border: '1px solid #E5E7EB', fontSize: '0.875rem', color: '#111827',
                  background: '#FAFAF8', boxSizing: 'border-box', resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  flex: 1, padding: '10px', borderRadius: 8,
                  border: '1px solid #E5E7EB', background: '#fff',
                  cursor: 'pointer', fontSize: '0.875rem', color: '#6B7280', fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleModalSave}
                disabled={modalSaving || !modalDate || !modalType}
                style={{
                  flex: 2, padding: '10px', borderRadius: 8,
                  border: 'none', background: '#059669',
                  cursor: modalSaving ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem', fontWeight: 700, color: '#fff',
                  opacity: modalSaving ? 0.7 : 1,
                }}
              >
                {modalSaving ? 'Saving…' : 'Log Post'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
