'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, LayoutDashboard, Loader2 } from 'lucide-react';

interface DimCount {
  key: string;
  count: number;
}

interface ActivationStats {
  adoption: { members_with_events: number; opened: number; repeat_turns: number };
  pathways: { drafted: number; confirmed: number; declined: number };
  intros: { requested: number; accepted: number };
  student_to_alumni: number;
  invites_suggested: number;
  outcomes: Record<string, number>;
  by_industry: DimCount[];
  by_location: DimCount[];
  by_community: DimCount[];
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="module-stat">
      <span className="module-stat-value">{value}</span>
      <span className="module-stat-label">{label}</span>
    </div>
  );
}

function DimList({ title, rows }: { title: string; rows: DimCount[] }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
      <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: 12 }}>{title}</h3>
      {rows.length === 0 ? (
        <p style={{ fontSize: '0.8125rem', color: '#9ca3af', margin: 0 }}>No events yet</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {rows.map(row => (
            <li
              key={row.key}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.8125rem',
                padding: '6px 0',
                borderBottom: '1px solid #f3f4f6',
              }}
            >
              <span style={{ color: '#111827' }}>{row.key}</span>
              <span style={{ color: '#6b7280' }}>{row.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ScoutActivationPage() {
  const [stats, setStats] = useState<ActivationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/scout/activation');
        const json = await res.json();
        if (json.error) {
          setError(json.error.message || 'Failed to load');
        } else {
          setStats(json.data);
        }
      } catch {
        setError('Failed to load activation stats');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  if (loading) {
    return (
      <div className="module-page">
        <div className="module-empty-state">
          <Loader2 size={32} className="animate-spin" />
          <p>Loading activation…</p>
        </div>
      </div>
    );
  }

  const outcomeEntries = Object.entries(stats?.outcomes || {});

  return (
    <div className="module-page">
      <header className="module-header">
        <div className="module-header-content">
          <div className="module-back-links">
            <Link href="/nucleus/scout" className="module-back">
              <ArrowLeft size={20} />
              Back to Scout Ops
            </Link>
            <Link href="/nucleus" className="module-back">
              <LayoutDashboard size={20} />
              Back to Nucleus
            </Link>
          </div>
          <div className="module-title-row">
            <div className="module-icon" style={{ backgroundColor: '#0f766e15', color: '#0f766e' }}>
              <LayoutDashboard size={24} />
            </div>
            <div>
              <h1>Network activation</h1>
              <p>
                Aggregate relationship events for institutions. No transcripts, drafts, phone books, or LinkedIn
                payloads.
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="module-main">
        {error && (
          <p style={{ color: '#b91c1c', marginBottom: 16 }}>{error}</p>
        )}
        <div className="module-stats-row">
          <Stat value={stats?.adoption.members_with_events ?? 0} label="Members with Scout activity" />
          <Stat value={stats?.adoption.opened ?? 0} label="Scout opened" />
          <Stat value={stats?.adoption.repeat_turns ?? 0} label="Repeat usage" />
          <Stat value={stats?.pathways.drafted ?? 0} label="Pathways drafted" />
          <Stat value={stats?.pathways.confirmed ?? 0} label="Pathways confirmed" />
          <Stat value={stats?.pathways.declined ?? 0} label="Pathways declined" />
          <Stat value={stats?.intros.requested ?? 0} label="Intros requested" />
          <Stat value={stats?.intros.accepted ?? 0} label="Intros accepted" />
          <Stat value={stats?.student_to_alumni ?? 0} label="Student → alumni events" />
          <Stat value={stats?.invites_suggested ?? 0} label="Invites suggested" />
        </div>

        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', marginBottom: 12 }}>
            Self-reported outcomes
          </h3>
          <div className="module-stats-row">
            {outcomeEntries.length === 0 ? (
              <p style={{ fontSize: '0.8125rem', color: '#9ca3af' }}>None yet</p>
            ) : (
              outcomeEntries.map(([k, v]) => <Stat key={k} value={v} label={k} />)
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <DimList title="Industries generating demand" rows={stats?.by_industry || []} />
          <DimList title="Locations generating demand" rows={stats?.by_location || []} />
          <DimList title="Communities" rows={stats?.by_community || []} />
        </div>
      </main>
    </div>
  );
}
