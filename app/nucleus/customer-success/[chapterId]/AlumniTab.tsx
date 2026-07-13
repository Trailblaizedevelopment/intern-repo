'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, X, Users, Linkedin,
  ChevronDown, Loader2, MapPin, Calendar, Clock,
} from 'lucide-react';
import { ChapterWithOnboarding } from '@/lib/supabase';
import {
  CS_UI, NEUTRAL_BADGE, TOOLBAR_BUTTON, TOOLBAR_SEARCH, CS_CARD, LIST_PILL,
} from '../cs-ui';

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

const FILTER_SELECT: React.CSSProperties = {
  height: 34,
  padding: '0 28px 0 12px',
  border: `1px solid ${CS_UI.border}`,
  borderRadius: 9999,
  fontSize: '0.8125rem',
  color: CS_UI.textSecondary,
  background: '#fff',
  cursor: 'pointer',
  appearance: 'none',
  WebkitAppearance: 'none',
  fontFamily: 'inherit',
};

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
  if (score >= 70) return '#059669';
  if (score >= 40) return '#d97706';
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
          border: `1px solid ${CS_UI.border}`,
        }}
      />
    );
  }

  const initials = getInitials(firstName, lastName);
  const bgColors = ['#0F172A', '#374151', '#2563eb', '#6b7280', '#059669'];
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
        letterSpacing: '0.02em',
        border: `1px solid ${CS_UI.border}`,
      }}
    >
      {initials || '?'}
    </div>
  );
}

function StatusBadge({ member }: { member: MergedAlumni }) {
  if (member.platform_joined) {
    return (
      <span style={{ ...LIST_PILL, color: CS_UI.success, background: '#ecfdf5', border: `1px solid #6ee7b7` }}>
        On Platform
      </span>
    );
  }

  const STATUS_STYLES: Record<string, { label: string; color: string; bg: string; border: string }> = {
    not_contacted: { label: 'Not Contacted', color: NEUTRAL_BADGE.color, bg: NEUTRAL_BADGE.bg, border: NEUTRAL_BADGE.border },
    touch1_sent: { label: 'Touch 1 Sent', color: CS_UI.warning, bg: '#fffbeb', border: '#fde68a' },
    touch1_confirmed: { label: 'Touch 1 ✓', color: CS_UI.warning, bg: '#fffbeb', border: '#fde68a' },
    touch2_sent: { label: 'Touch 2 Sent', color: CS_UI.warning, bg: '#fffbeb', border: '#fde68a' },
    touch3_sent: { label: 'Touch 3 Sent', color: CS_UI.warning, bg: '#fffbeb', border: '#fde68a' },
    signed_up: { label: 'Signed Up', color: CS_UI.success, bg: '#ecfdf5', border: '#6ee7b7' },
    declined: { label: 'Declined', color: CS_UI.textMuted, bg: NEUTRAL_BADGE.bg, border: NEUTRAL_BADGE.border },
    no_response: { label: 'No Response', color: CS_UI.textMuted, bg: NEUTRAL_BADGE.bg, border: NEUTRAL_BADGE.border },
  };

  const cfg = STATUS_STYLES[member.outreach_status] ?? {
    label: member.outreach_status,
    color: NEUTRAL_BADGE.color,
    bg: NEUTRAL_BADGE.bg,
    border: NEUTRAL_BADGE.border,
  };

  return (
    <span style={{ ...LIST_PILL, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
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
          background: CS_UI.border,
          borderRadius: 9999,
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

function KpiRow({ items }: { items: { label: string; value: string | number; sub?: string }[] }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'stretch',
      width: '100%',
      paddingBottom: 16,
      marginBottom: 4,
      borderBottom: `1px solid ${CS_UI.border}`,
    }}>
      {items.map((stat, index) => (
        <React.Fragment key={stat.label}>
          {index > 0 && (
            <div aria-hidden style={{ width: 1, alignSelf: 'stretch', margin: '4px 0', background: CS_UI.border, flexShrink: 0 }} />
          )}
          <div style={{ flex: '1 1 0', padding: '0 12px', minWidth: 0, textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: CS_UI.textSubtle }}>
              {stat.label}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '1.25rem', fontWeight: 700, color: CS_UI.text, fontVariantNumeric: 'tabular-nums' }}>
              {stat.value}
            </p>
            {stat.sub && (
              <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: CS_UI.textSubtle }}>{stat.sub}</p>
            )}
          </div>
        </React.Fragment>
      ))}
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <KpiRow
        items={[
          { label: 'Total Alumni', value: total, sub: 'from contact list' },
          { label: 'On Platform', value: joined, sub: 'signed up' },
          { label: 'Not Yet Joined', value: notJoined, sub: 'yet to sign up' },
          { label: 'Avg Engagement', value: joinedMembers.length > 0 ? avgEngagement : '—', sub: 'platform members' },
        ]}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <div style={{ ...TOOLBAR_SEARCH, flex: '1 1 220px' }}>
          <Search size={15} color={CS_UI.textSubtle} />
          <input
            type="text"
            placeholder="Search by name, email, phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: '0.8125rem',
              color: CS_UI.text,
              background: 'transparent',
              fontFamily: 'inherit',
              minWidth: 0,
            }}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <X size={14} color={CS_UI.textSubtle} />
            </button>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={FILTER_SELECT}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: CS_UI.textSubtle }} />
        </div>

        <div style={{ position: 'relative' }}>
          <select value={sort} onChange={(e) => setSort(e.target.value)} style={FILTER_SELECT}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>Sort: {o.label}</option>
            ))}
          </select>
          <ChevronDown size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: CS_UI.textSubtle }} />
        </div>

        <button type="button" onClick={fetchMembers} disabled={loading} style={{ ...TOOLBAR_BUTTON, opacity: loading ? 0.7 : 1 }}>
          {loading ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : null}
          Refresh
        </button>
      </div>

      {/* ── Member List ── */}
      {loading && members.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '40px 0', color: CS_UI.textMuted, justifyContent: 'center' }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
          Loading alumni data…
        </div>
      ) : members.length === 0 ? (
        <div style={{ ...CS_CARD, padding: '40px 24px', textAlign: 'center', color: CS_UI.textSubtle, background: CS_UI.surfaceMuted }}>
          <Users size={32} style={{ marginBottom: 12, opacity: 0.35 }} />
          <p style={{ fontWeight: 600, color: CS_UI.textSecondary, margin: 0 }}>No alumni found</p>
          <p style={{ fontSize: '0.8125rem', marginTop: 4 }}>
            {debouncedSearch || status !== 'all'
              ? 'Try adjusting your search or filters.'
              : 'Import alumni contacts to get started.'}
          </p>
        </div>
      ) : (
        <div style={{ ...CS_CARD, overflow: 'hidden', padding: 0 }}>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8125rem', color: CS_UI.textMuted, paddingTop: 4 }}>
          <span>Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} of {total}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={{ ...TOOLBAR_BUTTON, opacity: page === 1 ? 0.6 : 1, cursor: page === 1 ? 'not-allowed' : 'pointer' }}>
              Previous
            </button>
            <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page * 50 >= total} style={{ ...TOOLBAR_BUTTON, opacity: page * 50 >= total ? 0.6 : 1, cursor: page * 50 >= total ? 'not-allowed' : 'pointer' }}>
              Next
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
        gap: 12,
        padding: '10px 16px',
        borderBottom: isLast ? 'none' : `1px solid ${CS_UI.border}`,
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = CS_UI.surfaceMuted;
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
              fontSize: '0.875rem',
              color: CS_UI.text,
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
