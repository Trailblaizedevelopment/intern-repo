'use client';

import React, {
  useState, useEffect, useRef, useCallback,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, GraduationCap, Users, TrendingUp,
  Loader2, X, ArrowRight,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ChapterResult {
  id: string;
  chapter_name: string | null;
  school: string | null;
  fraternity: string | null;
  status: string | null;
}

interface ContactResult {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone_primary: string | null;
  chapter_id: string | null;
  chapter_name: { chapter_name: string | null } | null;
}

interface DealResult {
  id: string;
  name: string | null;
  stage: string | null;
  value: number | null;
  company: string | null;
}

interface SearchResults {
  chapters: ChapterResult[];
  contacts: ContactResult[];
  deals: DealResult[];
}

type ResultItem =
  | { kind: 'chapter'; data: ChapterResult }
  | { kind: 'contact'; data: ContactResult; chapterId: string | null }
  | { kind: 'deal'; data: DealResult };

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  active:      { label: 'Active',      color: '#065f46', bg: '#d1fae5' },
  onboarding:  { label: 'Onboarding',  color: '#854d0e', bg: '#fef9c3' },
  inactive:    { label: 'Inactive',    color: '#6b7280', bg: '#f3f4f6' },
  churned:     { label: 'Churned',     color: '#991b1b', bg: '#fee2e2' },
};

const DEAL_STAGE_META: Record<string, { label: string; color: string }> = {
  prospect:      { label: 'Prospect',       color: '#6b7280' },
  contacted:     { label: 'Contacted',      color: '#2563eb' },
  demo_booked:   { label: 'Demo Booked',    color: '#7c3aed' },
  demo_done:     { label: 'Demo Done',      color: '#d97706' },
  proposal_sent: { label: 'Proposal Sent',  color: '#d97706' },
  negotiation:   { label: 'Negotiation',    color: '#ca8a04' },
  closed_won:    { label: 'Closed Won ✓',  color: '#16a34a' },
  closed_lost:   { label: 'Closed Lost',    color: '#dc2626' },
};

function formatCurrency(v: number | null): string {
  if (!v) return '';
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v}`;
}

// ── Keyboard nav helper ───────────────────────────────────────────────────────

function flattenResults(results: SearchResults): ResultItem[] {
  const items: ResultItem[] = [];
  for (const c of results.chapters) {
    items.push({ kind: 'chapter', data: c });
  }
  for (const c of results.contacts) {
    items.push({ kind: 'contact', data: c, chapterId: c.chapter_id });
  }
  for (const d of results.deals) {
    items.push({ kind: 'deal', data: d });
  }
  return items;
}

// ── Main component ─────────────────────────────────────────────────────────────

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
}

export default function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const AUTH = 'Bearer hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h';

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setResults(null);
      setFocusedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.trim().length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, {
          headers: { Authorization: AUTH },
        });
        const json = await res.json();
        setResults(json);
        setFocusedIdx(0);
      } catch {
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const allItems = results ? flattenResults(results) : [];
  const totalCount = allItems.length;

  const navigate = useCallback((item: ResultItem) => {
    if (item.kind === 'chapter') {
      router.push(`/nucleus/customer-success/${item.data.id}`);
    } else if (item.kind === 'contact' && item.chapterId) {
      router.push(`/nucleus/customer-success/${item.chapterId}`);
    } else if (item.kind === 'deal') {
      router.push(`/nucleus/pipeline?deal=${item.data.id}`);
    }
    onClose();
  }, [router, onClose]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedIdx(i => Math.min(i + 1, totalCount - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter' && allItems[focusedIdx]) { navigate(allItems[focusedIdx]); return; }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, allItems, focusedIdx, totalCount, navigate, onClose]);

  if (!open) return null;

  const hasResults = results && totalCount > 0;
  const isEmpty = results && totalCount === 0 && !loading;

  let globalIdx = 0;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          zIndex: 9000, backdropFilter: 'blur(2px)',
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '15%', left: '50%', transform: 'translateX(-50%)',
        width: 580, maxWidth: 'calc(100vw - 32px)',
        background: '#fff', borderRadius: 16, boxShadow: '0 25px 80px rgba(0,0,0,0.22)',
        zIndex: 9001, overflow: 'hidden',
        fontFamily: 'inherit',
      }}>
        {/* Search bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
          borderBottom: '1px solid #f0f0f0',
        }}>
          {loading
            ? <Loader2 size={18} style={{ color: '#9ca3af', flexShrink: 0, animation: 'spin 1s linear infinite' }} />
            : <Search size={18} style={{ color: '#9ca3af', flexShrink: 0 }} />
          }
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search chapters, contacts, deals…"
            style={{
              flex: 1, border: 'none', outline: 'none',
              fontSize: '0.9375rem', color: '#111827', background: 'transparent',
              fontFamily: 'inherit',
            }}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setResults(null); inputRef.current?.focus(); }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#9ca3af', padding: 2, display: 'flex', flexShrink: 0,
              }}
            >
              <X size={16} />
            </button>
          )}
          <kbd style={{
            fontSize: '0.65rem', color: '#9ca3af', background: '#f3f4f6',
            border: '1px solid #e5e7eb', borderRadius: 5, padding: '2px 6px',
            fontFamily: 'monospace', flexShrink: 0,
          }}>ESC</kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 440, overflowY: 'auto' }}>
          {/* Empty state */}
          {isEmpty && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '40px 16px', color: '#9ca3af', gap: 8,
            }}>
              <Search size={28} style={{ opacity: 0.25 }} />
              <span style={{ fontSize: '0.875rem' }}>No results for &ldquo;{query}&rdquo;</span>
            </div>
          )}

          {/* Chapters section */}
          {results && results.chapters.length > 0 && (
            <div>
              <SectionHeader icon={<GraduationCap size={12} />} label="Chapters" />
              {results.chapters.map(c => {
                const idx = globalIdx++;
                const isFocused = focusedIdx === idx;
                const status = c.status ? (STATUS_META[c.status] ?? null) : null;
                return (
                  <ResultRow
                    key={c.id}
                    isFocused={isFocused}
                    onMouseEnter={() => setFocusedIdx(idx)}
                    onClick={() => navigate({ kind: 'chapter', data: c })}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <GraduationCap size={14} style={{ color: '#7c3aed' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>
                        {c.chapter_name ?? 'Unnamed Chapter'}
                      </div>
                      <div style={{ fontSize: '0.73rem', color: '#9ca3af' }}>
                        {[c.fraternity, c.school].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {status && (
                      <span style={{
                        fontSize: '0.65rem', fontWeight: 600, padding: '2px 7px', borderRadius: 10,
                        background: status.bg, color: status.color, flexShrink: 0,
                      }}>
                        {status.label}
                      </span>
                    )}
                    <ArrowRight size={14} style={{ color: '#d1d5db', flexShrink: 0 }} />
                  </ResultRow>
                );
              })}
            </div>
          )}

          {/* Contacts section */}
          {results && results.contacts.length > 0 && (
            <div>
              <SectionHeader icon={<Users size={12} />} label="Alumni Contacts" />
              {results.contacts.map(c => {
                const idx = globalIdx++;
                const isFocused = focusedIdx === idx;
                const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown';
                const chName = (c.chapter_name as unknown as { chapter_name: string | null } | null)?.chapter_name ?? null;
                return (
                  <ResultRow
                    key={c.id}
                    isFocused={isFocused}
                    onMouseEnter={() => setFocusedIdx(idx)}
                    onClick={() => navigate({ kind: 'contact', data: c, chapterId: c.chapter_id })}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Users size={14} style={{ color: '#2563eb' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>{name}</div>
                      <div style={{ fontSize: '0.73rem', color: '#9ca3af' }}>
                        {[c.phone_primary, chName].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {chName && (
                      <span style={{
                        fontSize: '0.65rem', fontWeight: 500, padding: '2px 7px', borderRadius: 10,
                        background: '#f3f4f6', color: '#6b7280', flexShrink: 0,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130,
                      }}>
                        {chName}
                      </span>
                    )}
                    <ArrowRight size={14} style={{ color: '#d1d5db', flexShrink: 0 }} />
                  </ResultRow>
                );
              })}
            </div>
          )}

          {/* Deals section */}
          {results && results.deals.length > 0 && (
            <div>
              <SectionHeader icon={<TrendingUp size={12} />} label="Deals" />
              {results.deals.map(d => {
                const idx = globalIdx++;
                const isFocused = focusedIdx === idx;
                const stageMeta = d.stage ? (DEAL_STAGE_META[d.stage] ?? null) : null;
                return (
                  <ResultRow
                    key={d.id}
                    isFocused={isFocused}
                    onMouseEnter={() => setFocusedIdx(idx)}
                    onClick={() => navigate({ kind: 'deal', data: d })}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <TrendingUp size={14} style={{ color: '#d97706' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>
                        {d.name ?? 'Unnamed Deal'}
                      </div>
                      <div style={{ fontSize: '0.73rem', color: '#9ca3af' }}>
                        {[d.company, d.value ? formatCurrency(d.value) : null].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {stageMeta && (
                      <span style={{
                        fontSize: '0.65rem', fontWeight: 600, padding: '2px 7px', borderRadius: 10,
                        background: '#f9fafb', color: stageMeta.color, flexShrink: 0,
                      }}>
                        {stageMeta.label}
                      </span>
                    )}
                    <ArrowRight size={14} style={{ color: '#d1d5db', flexShrink: 0 }} />
                  </ResultRow>
                );
              })}
            </div>
          )}

          {/* Hint when no query yet */}
          {!query && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '36px 16px', color: '#9ca3af', gap: 6,
            }}>
              <Search size={28} style={{ opacity: 0.2 }} />
              <span style={{ fontSize: '0.8rem' }}>Search chapters, contacts, and deals</span>
              <span style={{ fontSize: '0.72rem', color: '#d1d5db' }}>Type at least 2 characters</span>
            </div>
          )}
        </div>

        {/* Footer hint */}
        {hasResults && (
          <div style={{
            padding: '8px 16px', borderTop: '1px solid #f0f0f0',
            display: 'flex', gap: 16, alignItems: 'center',
          }}>
            <KbdHint keys={['↑', '↓']} label="navigate" />
            <KbdHint keys={['↵']} label="open" />
            <KbdHint keys={['ESC']} label="close" />
          </div>
        )}
      </div>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '8px 16px 4px', background: '#fafafa',
      borderBottom: '1px solid #f3f4f6',
    }}>
      <span style={{ color: '#9ca3af' }}>{icon}</span>
      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
    </div>
  );
}

interface ResultRowProps {
  isFocused: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
  children: React.ReactNode;
}

function ResultRow({ isFocused, onMouseEnter, onClick, children }: ResultRowProps) {
  return (
    <div
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 16px', cursor: 'pointer',
        background: isFocused ? '#eff6ff' : '#fff',
        borderBottom: '1px solid #f9f9f9',
        transition: 'background 0.1s',
      }}
    >
      {children}
    </div>
  );
}

function KbdHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {keys.map(k => (
        <kbd key={k} style={{
          fontSize: '0.65rem', color: '#9ca3af', background: '#f3f4f6',
          border: '1px solid #e5e7eb', borderRadius: 4, padding: '1px 5px',
          fontFamily: 'monospace',
        }}>{k}</kbd>
      ))}
      <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>{label}</span>
    </div>
  );
}
