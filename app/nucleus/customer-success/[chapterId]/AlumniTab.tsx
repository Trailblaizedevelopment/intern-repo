'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, X, Users, TrendingUp, UserCheck, UserX, Linkedin,
  ChevronDown, Loader2, MapPin, Calendar, Clock,
} from 'lucide-react';
import { ChapterWithOnboarding } from '@/lib/supabase';

// ── Types ────────────────────────────────────────────────────────────────────

interface MergedAlumni {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  avatar_url: string | null;
  grad_year: number | null;
  location: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  outreach_status: string;
  platform_joined: boolean;
  last_active_at: string | null;
  member_status: string | null;
  engagement_score: number;
}

interface AlumniResponse {
  members: MergedAlumni[];
  total: number;
  joined: number;
  not_joined: number;
  external_chapter_id: string | null;
}

interface AlumniTabProps {
  chapter: ChapterWithOnboarding;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'platform_joined', label: '✅ Joined Platform' },
  { value: 'not_joined', label: '⏳ Not Yet Joined' },
  { value: 'touch1_sent', label: 'Outreach: Touch 1' },
  { value: 'touch2_sent', label: 'Outreach: Touch 2' },
  { value: 'touch3_sent', label: 'Outreach: Touch 3' },
  { value: 'signed_up', label: '🎉 Signed Up' },
  { value: 'declined', label: '✗ Declined' },
  { value: 'not_contacted', label: 'Not Contacted' },
  { value: 'no_response', label: 'No Response' },
] as const;

const SORT_OPTIONS = [
  { value: 'engagement_score', label: 'Engagement Score' },
  { value: 'grad_year', label: 'Grad Year' },
  { value: 'name', label: 'Name' },
  { value: 'last_active', label: 'Last Active' },
] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null): string | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function getInitials(firstName: string, lastName: string): string {
  return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
}

function getEngagementColor(score: number): string {
  if (score >= 70) return '#10b981'; // emerald
  if (score >= 40) return '#C4874A'; // amber
  return '#9ca3af'; // slate
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Avatar({
  avatarUrl,
  firstName,
  lastName,
  size = 40,
}: {
  avatarUrl: string | null;
  firstName: string;
  lastName: string;
  size?: number;
}) {
  const [imgError, setImgError] = useState(false);

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={`${firstName} ${lastName}`}
        onError={() => setImgError(true)}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
          border: '2px solid #E8EDF5',
        }}
      />
    );
  }

  const initials = getInitials(firstName, lastName);
  const bgColors = ['#1B2A4A', '#3A5A7A', '#C4874A', '#5C5449', '#2A4229'];
  const colorIndex =
    ((firstName.charCodeAt(0) || 0) + (lastName.charCodeAt(0) || 0)) %
    bgColors.length;

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bgColors[colorIndex],
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: '#fff',
        fontWeight: 600,
        fontSize: size * 0.35,
        fontFamily: "'Instrument Serif', Georgia, serif",
        letterSpacing: '0.02em',
        border: '2px solid #E8EDF5',
      }}
    >
      {initials || '?'}
    </div>
  );
}

function StatusBadge({ member }: { member: MergedAlumni }) {
  if (member.platform_joined) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 10px',
          borderRadius: 2,
          fontSize: '0.75rem',
          fontWeight: 600,
          color: '#065f46',
          background: '#d1fae5',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        ✅ On Platform
      </span>
    );
  }

  const STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
    not_contacted:  { label: 'Not Contacted',   color: '#6b7280', bg: '#f3f4f6' },
    touch1_sent:    { label: 'Touch 1 Sent',    color: '#92400e', bg: '#fef3c7' },
    touch1_confirmed: { label: 'Touch 1 ✓',    color: '#78350f', bg: '#FDF0E0' },
    touch2_sent:    { label: 'Touch 2 Sent',    color: '#b45309', bg: '#fef3c7' },
    touch3_sent:    { label: 'Touch 3 Sent',    color: '#d97706', bg: '#fffbeb' },
    signed_up:      { label: 'Signed Up',       color: '#065f46', bg: '#d1fae5' },
    declined:       { label: 'Declined',        color: '#4b5563', bg: '#e5e7eb' },
    no_response:    { label: 'No Response',     color: '#6b7280', bg: '#f9fafb' },
  };

  const cfg = STATUS_STYLES[member.outreach_status] ?? {
    label: member.outreach_status,
    color: '#6b7280',
    bg: '#f3f4f6',
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 10px',
        borderRadius: 2,
        fontSize: '0.75rem',
        fontWeight: 600,
        color: cfg.color,
        background: cfg.bg,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {cfg.label}
    </span>
  );
}

function EngagementBar({ score }: { score: number }) {
  const color = getEngagementColor(score);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        minWidth: 80,
      }}
    >
      <div
        style={{
          flex: 1,
          height: 4,
          background: '#E8EDF5',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${score}%`,
            background: color,
            borderRadius: 2,
            transition: 'width 0.4s ease',
          }}
        />
      </div>
      <span
        style={{
          fontSize: '0.7rem',
          fontWeight: 600,
          color,
          minWidth: 22,
          textAlign: 'right',
        }}
      >
        {score}
      </span>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: '#F7F5F1',
        border: '1px solid #D9D4CC',
        borderRadius: 2,
        padding: '14px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        flex: '1 1 0',
        minWidth: 110,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: accent || '#5C5449',
          marginBottom: 2,
        }}
      >
        {icon}
        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#5C5449', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </span>
      </div>
      <div
        style={{
          fontSize: '1.6rem',
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontWeight: 400,
          color: accent || '#1B2A4A',
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 1 }}>{sub}</div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AlumniTab({ chapter, showToast }: AlumniTabProps) {
  const [members, setMembers] = useState<MergedAlumni[]>([]);
  const [total, setTotal] = useState(0);
  const [joined, setJoined] = useState(0);
  const [notJoined, setNotJoined] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('engagement_score');

  const searchRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce search
  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => { if (searchRef.current) clearTimeout(searchRef.current); };
  }, [search]);

  // Reset page on filter/sort change
  useEffect(() => { setPage(1); }, [status, sort]);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search: debouncedSearch,
        status,
        page: String(page),
        limit: '50',
        sort,
      });
      const res = await fetch(`/api/chapters/${chapter.id}/alumni?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: AlumniResponse = await res.json();
      setMembers(json.members || []);
      setTotal(json.total || 0);
      setJoined(json.joined || 0);
      setNotJoined(json.not_joined || 0);
    } catch (err) {
      console.error('Failed to fetch alumni:', err);
      showToast('Failed to load alumni data', 'error');
    } finally {
      setLoading(false);
    }
  }, [chapter.id, debouncedSearch, status, page, sort, showToast]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  // Avg engagement of joined members
  const joinedMembers = members.filter((m) => m.platform_joined);
  const avgEngagement =
    joinedMembers.length > 0
      ? Math.round(joinedMembers.reduce((sum, m) => sum + m.engagement_score, 0) / joinedMembers.length)
      : 0;

  return (
    <div style={{ maxWidth: 820, display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Header Stats ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <StatCard
          icon={<Users size={14} />}
          label="Total Alumni"
          value={total}
          sub="from contact list"
          accent="#1B2A4A"
        />
        <StatCard
          icon={<UserCheck size={14} />}
          label="On Platform"
          value={joined}
          sub="signed up"
          accent="#065f46"
        />
        <StatCard
          icon={<UserX size={14} />}
          label="Not Yet Joined"
          value={notJoined}
          sub="yet to sign up"
          accent="#C4874A"
        />
        <StatCard
          icon={<TrendingUp size={14} />}
          label="Avg Engagement"
          value={joinedMembers.length > 0 ? `${avgEngagement}` : '—'}
          sub="of platform members"
          accent="#3A5A7A"
        />
      </div>

      {/* ── Search + Filters ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {/* Search */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flex: '1 1 200px',
            minWidth: 180,
            background: '#fff',
            border: '1px solid #D9D4CC',
            borderRadius: 2,
            padding: '7px 12px',
          }}
        >
          <Search size={15} color="#9ca3af" />
          <input
            type="text"
            placeholder="Search by name, email, phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: '0.85rem',
              color: '#1B2A4A',
              background: 'transparent',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
            >
              <X size={14} color="#9ca3af" />
            </button>
          )}
        </div>

        {/* Status filter */}
        <div style={{ position: 'relative' }}>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{
              padding: '7px 28px 7px 10px',
              border: '1px solid #D9D4CC',
              borderRadius: 2,
              fontSize: '0.82rem',
              color: '#1B2A4A',
              background: '#fff',
              cursor: 'pointer',
              appearance: 'none',
              WebkitAppearance: 'none',
            }}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={13}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#9ca3af' }}
          />
        </div>

        {/* Sort */}
        <div style={{ position: 'relative' }}>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            style={{
              padding: '7px 28px 7px 10px',
              border: '1px solid #D9D4CC',
              borderRadius: 2,
              fontSize: '0.82rem',
              color: '#1B2A4A',
              background: '#fff',
              cursor: 'pointer',
              appearance: 'none',
              WebkitAppearance: 'none',
            }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                Sort: {o.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={13}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#9ca3af' }}
          />
        </div>

        {/* Refresh */}
        <button
          onClick={fetchMembers}
          disabled={loading}
          style={{
            padding: '7px 14px',
            border: '1px solid #D9D4CC',
            borderRadius: 2,
            fontSize: '0.82rem',
            color: '#5C5449',
            background: '#F7F5F1',
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {loading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : '↻'} Refresh
        </button>
      </div>

      {/* ── Member List ── */}
      {loading && members.length === 0 ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '48px 0',
            color: '#6b7280',
            justifyContent: 'center',
          }}
        >
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
          Loading alumni data…
        </div>
      ) : members.length === 0 ? (
        <div
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            color: '#9ca3af',
            background: '#F7F5F1',
            border: '1px solid #D9D4CC',
            borderRadius: 2,
          }}
        >
          <Users size={36} style={{ marginBottom: 12, opacity: 0.4 }} />
          <p style={{ fontWeight: 600, color: '#5C5449' }}>No alumni found</p>
          <p style={{ fontSize: '0.8rem', marginTop: 4 }}>
            {debouncedSearch || status !== 'all'
              ? 'Try adjusting your search or filters.'
              : 'Import alumni contacts to get started.'}
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid #D9D4CC',
            borderRadius: 2,
            overflow: 'hidden',
            background: '#fff',
          }}
        >
          {members.map((member, idx) => (
            <AlumniRow
              key={member.id}
              member={member}
              isLast={idx === members.length - 1}
            />
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {total > 50 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.82rem',
            color: '#6b7280',
            padding: '8px 0',
          }}
        >
          <span>
            Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} of {total}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{
                padding: '5px 14px',
                border: '1px solid #D9D4CC',
                borderRadius: 2,
                fontSize: '0.82rem',
                background: page === 1 ? '#F7F5F1' : '#fff',
                cursor: page === 1 ? 'not-allowed' : 'pointer',
                color: '#1B2A4A',
              }}
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page * 50 >= total}
              style={{
                padding: '5px 14px',
                border: '1px solid #D9D4CC',
                borderRadius: 2,
                fontSize: '0.82rem',
                background: page * 50 >= total ? '#F7F5F1' : '#fff',
                cursor: page * 50 >= total ? 'not-allowed' : 'pointer',
                color: '#1B2A4A',
              }}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Row component (separated to reduce re-renders) ────────────────────────────

function AlumniRow({
  member,
  isLast,
}: {
  member: MergedAlumni;
  isLast: boolean;
}) {
  const ago = timeAgo(member.last_active_at);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '12px 16px',
        borderBottom: isLast ? 'none' : '1px solid #EAE8E3',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = '#FAFAF8';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'transparent';
      }}
    >
      {/* Avatar */}
      <Avatar
        avatarUrl={member.avatar_url}
        firstName={member.first_name}
        lastName={member.last_name}
        size={40}
      />

      {/* Name + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontWeight: 600,
              fontSize: '0.9rem',
              color: '#1B2A4A',
              whiteSpace: 'nowrap',
            }}
          >
            {member.full_name}
          </span>
          {member.grad_year && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                fontSize: '0.72rem',
                color: '#6b7280',
              }}
            >
              <Calendar size={11} />
              &lsquo;{String(member.grad_year).slice(-2)}
            </span>
          )}
        </div>
        {member.location && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              fontSize: '0.75rem',
              color: '#9ca3af',
              marginTop: 2,
            }}
          >
            <MapPin size={11} />
            {member.location}
          </div>
        )}
      </div>

      {/* Status badge */}
      <StatusBadge member={member} />

      {/* Engagement bar — only for platform members */}
      {member.platform_joined && (
        <div style={{ minWidth: 100 }}>
          <EngagementBar score={member.engagement_score} />
        </div>
      )}

      {/* LinkedIn */}
      {member.linkedin_url ? (
        <a
          href={member.linkedin_url}
          target="_blank"
          rel="noopener noreferrer"
          title="LinkedIn"
          style={{
            color: '#0077b5',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <Linkedin size={16} />
        </a>
      ) : (
        <div style={{ width: 16, flexShrink: 0 }} />
      )}

      {/* Last active */}
      {member.platform_joined && ago ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: '0.72rem',
            color: '#9ca3af',
            whiteSpace: 'nowrap',
            minWidth: 70,
            justifyContent: 'flex-end',
          }}
        >
          <Clock size={11} />
          {ago}
        </div>
      ) : (
        <div style={{ minWidth: 70 }} />
      )}
    </div>
  );
}
