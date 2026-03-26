'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ExternalLink, Loader2, Users, Phone, Mail, Smartphone, Copy, Check } from 'lucide-react';
import { ChapterWithOnboarding, supabase } from '@/lib/supabase';
import Link from 'next/link';

interface AlumniOutreachTabProps {
  chapter: ChapterWithOnboarding;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onUpdate: () => void;
}

interface AlumniStats {
  total: number;
  have_email: number;
  have_phone: number;
  imessage: number;
  contacted: number;
  responded: number;
  signed_up: number;
  touch1_ready: number;
  touch2_due: number;
  touch3_due: number;
}

export default function AlumniOutreachTab({ chapter, showToast, onUpdate }: AlumniOutreachTabProps) {
  const [stats, setStats] = useState<AlumniStats | null>(null);
  const [loading, setLoading] = useState(true);

  // CSV import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; duplicates: number; errors: { row: number; message: string }[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Signup links state
  const [alumniJoinLink, setAlumniJoinLink] = useState(chapter.alumni_join_link || '');
  const [activesJoinLink, setActivesJoinLink] = useState(chapter.actives_join_link || '');
  const [savingLinks, setSavingLinks] = useState(false);
  const [copiedAlumni, setCopiedAlumni] = useState(false);
  const [copiedActives, setCopiedActives] = useState(false);

  useEffect(() => {
    fetchStats();
  }, [chapter.id]);

  useEffect(() => {
    setAlumniJoinLink(chapter.alumni_join_link || '');
    setActivesJoinLink(chapter.actives_join_link || '');
  }, [chapter.alumni_join_link, chapter.actives_join_link]);

  async function handleImport() {
    if (!importFile) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('chapter_id', chapter.id);
      const res = await fetch('/api/alumni/import', { method: 'POST', body: formData });
      const json = await res.json();
      if (json.error) {
        showToast(json.error.message || 'Import failed', 'error');
      } else {
        setImportResult(json.data);
        showToast(`✓ Imported ${json.data.imported}, skipped ${json.data.skipped}, duplicates ${json.data.duplicates}`, 'success');
        fetchStats();
      }
    } catch {
      showToast('Import failed', 'error');
    } finally {
      setImporting(false);
    }
  }

  async function saveLinks() {
    if (!supabase) return;
    setSavingLinks(true);
    try {
      const { error } = await supabase.from('chapters').update({
        alumni_join_link: alumniJoinLink || null,
        actives_join_link: activesJoinLink || null,
      }).eq('id', chapter.id);
      if (error) {
        showToast(`Failed: ${error.message}`, 'error');
      } else {
        showToast('Links saved', 'success');
        onUpdate();
      }
    } catch {
      showToast('Failed to save links', 'error');
    } finally {
      setSavingLinks(false);
    }
  }

  async function copyToClipboard(text: string, type: 'alumni' | 'actives') {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'alumni') { setCopiedAlumni(true); setTimeout(() => setCopiedAlumni(false), 2000); }
      else { setCopiedActives(true); setTimeout(() => setCopiedActives(false), 2000); }
    } catch { showToast('Failed to copy', 'error'); }
  }

  async function fetchStats() {
    setLoading(true);
    try {
      const res = await fetch(`/api/alumni/stats?chapter_id=${chapter.id}`);
      const json = await res.json();
      if (json.data) {
        setStats(json.data);
      } else {
        showToast('Could not load alumni stats', 'info');
      }
    } catch {
      showToast('Failed to fetch alumni stats', 'error');
    } finally {
      setLoading(false);
    }
  }

  const emailSequenceLive = !!chapter.email_sequence_live;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '40px 0', color: '#6b7280' }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
        Loading alumni stats…
      </div>
    );
  }

  const responseRate = stats && stats.contacted > 0
    ? Math.round((stats.responded / stats.contacted) * 100)
    : 0;

  return (
    <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Import Alumni List */}
      <section>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', marginBottom: 12 }}>
          📤 Import Alumni List
        </h3>
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div className="module-form-group" style={{ margin: 0, flex: 1 }}>
              <input
                type="file"
                accept=".csv"
                ref={fileInputRef}
                onChange={e => { setImportFile(e.target.files?.[0] || null); setImportResult(null); }}
                style={{ fontSize: '0.85rem' }}
              />
            </div>
            <button
              className="module-primary-btn"
              onClick={handleImport}
              disabled={!importFile || importing}
              style={{ flexShrink: 0, padding: '7px 18px', fontSize: '0.85rem' }}
            >
              {importing ? 'Uploading…' : 'Upload'}
            </button>
          </div>
          <p style={{ fontSize: '0.78rem', color: '#9ca3af', margin: 0 }}>
            Accepted columns: <strong>first_name, last_name, phone, email, year</strong>
          </p>
          {importResult && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: '#d1fae5', borderRadius: 8, fontSize: '0.85rem', color: '#065f46' }}>
              ✓ Imported <strong>{importResult.imported}</strong>, skipped <strong>{importResult.skipped}</strong>, duplicates <strong>{importResult.duplicates}</strong>
              {importResult.errors.length > 0 && (
                <div style={{ marginTop: 4, color: '#92400e' }}>
                  {importResult.errors.slice(0, 3).map(e => <div key={e.row}>Row {e.row}: {e.message}</div>)}
                </div>
              )}
              <button
                className="module-cancel-btn"
                onClick={() => { setImportResult(null); setImportFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                style={{ marginTop: 8, padding: '4px 12px', fontSize: '0.78rem' }}
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Import Stats */}
      <section>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', marginBottom: 12 }}>
          Import Stats
        </h3>
        {stats ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
            {[
              { label: 'Total Alumni', value: stats.total, icon: <Users size={18} />, color: '#374151', bg: '#f9fafb' },
              { label: 'Have Email', value: stats.have_email ?? '—', icon: <Mail size={18} />, color: '#2563eb', bg: '#dbeafe' },
              { label: 'Have Phone', value: stats.have_phone, icon: <Phone size={18} />, color: '#8b5cf6', bg: '#ede9fe' },
              { label: 'Mobile (iMsg)', value: stats.imessage, icon: <Smartphone size={18} />, color: '#059669', bg: '#d1fae5' },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
                <div style={{ color: s.color, marginBottom: 6, display: 'flex', justifyContent: 'center' }}>{s.icon}</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>No import data yet.</div>
        )}
      </section>

      {/* Linq Pipeline */}
      <section>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', marginBottom: 12 }}>
          Linq Pipeline
        </h3>
        {stats ? (
          <div>
            {/* Funnel */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {[
                { label: 'Contacted', value: stats.contacted, color: '#7c3aed', bg: '#ede9fe' },
                { label: '→', value: null, color: '#9ca3af', bg: 'transparent' },
                { label: 'Responded', value: stats.responded, color: '#2563eb', bg: '#dbeafe' },
                { label: '→', value: null, color: '#9ca3af', bg: 'transparent' },
                { label: 'Signed Up', value: stats.signed_up, color: '#059669', bg: '#d1fae5' },
              ].map((item, i) => (
                item.value === null ? (
                  <span key={i} style={{ fontSize: '1.2rem', color: '#9ca3af' }}>→</span>
                ) : (
                  <div key={item.label} style={{ background: item.bg, borderRadius: 10, padding: '10px 18px', textAlign: 'center', minWidth: 100 }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: item.color }}>{item.value}</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{item.label}</div>
                  </div>
                )
              ))}
              <div style={{ marginLeft: 12, background: '#f9fafb', borderRadius: 10, padding: '10px 18px' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#374151' }}>{responseRate}%</div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Response Rate</div>
              </div>
            </div>

            {/* Touch queue badges */}
            {(stats.touch1_ready > 0 || stats.touch2_due > 0 || stats.touch3_due > 0) && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {stats.touch1_ready > 0 && (
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, padding: '4px 12px', borderRadius: 99, background: '#ede9fe', color: '#7c3aed' }}>
                    {stats.touch1_ready} ready for Touch 1
                  </span>
                )}
                {stats.touch2_due > 0 && (
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, padding: '4px 12px', borderRadius: 99, background: '#fef3c7', color: '#d97706' }}>
                    {stats.touch2_due} due Touch 2
                  </span>
                )}
                {stats.touch3_due > 0 && (
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, padding: '4px 12px', borderRadius: 99, background: '#dbeafe', color: '#2563eb' }}>
                    {stats.touch3_due} due Touch 3
                  </span>
                )}
              </div>
            )}

            {/* Link to full alumni list */}
            <Link
              href={`/dashboard/clients/${chapter.id}/alumni`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: '#ec4899', fontWeight: 600, textDecoration: 'none' }}
            >
              View Full Alumni List <ExternalLink size={13} />
            </Link>
          </div>
        ) : (
          <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>No pipeline data yet.</div>
        )}
      </section>

      {/* Signup Links */}
      <section>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', marginBottom: 12 }}>
          Signup Links
        </h3>
        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 18px' }}>
          <div className="cs-links-grid" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Alumni Join Link</label>
              <div className="cs-link-input-row" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="url"
                  value={alumniJoinLink}
                  onChange={e => setAlumniJoinLink(e.target.value)}
                  placeholder="https://trailblaize.net/join/..."
                  style={{ flex: 1, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: '0.85rem' }}
                />
                <button
                  className="cs-copy-link-btn"
                  onClick={() => alumniJoinLink && copyToClipboard(alumniJoinLink, 'alumni')}
                  disabled={!alumniJoinLink}
                  title="Copy link"
                  style={{ padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: alumniJoinLink ? 'pointer' : 'default', opacity: alumniJoinLink ? 1 : 0.4 }}
                >
                  {copiedAlumni ? <Check size={15} color="#10b981" /> : <Copy size={15} />}
                </button>
              </div>
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Actives Join Link</label>
              <div className="cs-link-input-row" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="url"
                  value={activesJoinLink}
                  onChange={e => setActivesJoinLink(e.target.value)}
                  placeholder="https://trailblaize.net/join/..."
                  style={{ flex: 1, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: '0.85rem' }}
                />
                <button
                  className="cs-copy-link-btn"
                  onClick={() => activesJoinLink && copyToClipboard(activesJoinLink, 'actives')}
                  disabled={!activesJoinLink}
                  title="Copy link"
                  style={{ padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: activesJoinLink ? 'pointer' : 'default', opacity: activesJoinLink ? 1 : 0.4 }}
                >
                  {copiedActives ? <Check size={15} color="#10b981" /> : <Copy size={15} />}
                </button>
              </div>
            </div>
          </div>
          <button
            className="module-primary-btn"
            onClick={saveLinks}
            disabled={savingLinks}
            style={{ marginTop: 12, padding: '7px 18px', fontSize: '0.85rem' }}
          >
            {savingLinks ? 'Saving…' : 'Save Links'}
          </button>
        </div>
      </section>

      {/* Email Status */}
      <section>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', marginBottom: 12 }}>
          Email Status
        </h3>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 10, background: emailSequenceLive ? '#d1fae5' : '#f3f4f6' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: emailSequenceLive ? '#10b981' : '#9ca3af' }} />
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: emailSequenceLive ? '#065f46' : '#6b7280' }}>
            SendGrid Sequence: {emailSequenceLive ? 'Live ✓' : 'Not set up'}
          </span>
        </div>
        {!emailSequenceLive && (
          <p style={{ marginTop: 8, fontSize: '0.8rem', color: '#9ca3af' }}>
            Mark "SendGrid sequence live" in Set Up to track this.
          </p>
        )}
      </section>
    </div>
  );
}
