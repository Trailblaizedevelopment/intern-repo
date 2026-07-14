'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ExternalLink, Loader2, Users, Phone, Mail, Smartphone, Copy, Check, Upload, X } from 'lucide-react';
import { ChapterWithOnboarding } from '@/lib/supabase';
import Link from 'next/link';
import {
  CS_UI, NEUTRAL_BADGE, TOOLBAR_BUTTON, TOOLBAR_BUTTON_PRIMARY,
  CS_CARD, SECTION_TITLE, LIST_PILL, DETAIL_PILL,
} from '../cs-ui';

const INPUT_STYLE: React.CSSProperties = {
  flex: 1,
  padding: '7px 12px',
  border: `1px solid ${CS_UI.border}`,
  borderRadius: 8,
  fontSize: '0.8125rem',
  fontFamily: 'inherit',
  color: CS_UI.text,
};

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

interface DetectedColumn {
  raw_header: string;
  mapped_to: string | null;
}

interface SampleRow {
  first_name: string;
  last_name: string;
  phone_primary: string | null;
  email: string | null;
  year: number | null;
}

interface PreviewData {
  detected_columns: DetectedColumn[];
  sample_rows: SampleRow[];
  counts: {
    total_rows: number;
    will_import: number;
    skip_pre_1970: number;
    skip_no_name: number;
    skip_invalid_phone: number;
    duplicates: number;
  };
  warnings: string[];
  unmapped_headers: string[];
  has_required_fields: boolean;
}

export default function AlumniOutreachTab({ chapter, showToast, onUpdate }: AlumniOutreachTabProps) {
  const [stats, setStats] = useState<AlumniStats | null>(null);
  const [loading, setLoading] = useState(true);

  // CSV import state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; duplicates: number; errors: { row: number; message: string }[] } | null>(null);
  const [dragOver, setDragOver] = useState(false);
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

  const handleFileSelect = useCallback((file: File | null) => {
    setImportFile(file);
    setPreviewData(null);
    setImportResult(null);
  }, []);

  async function handlePreview() {
    if (!importFile) return;
    setPreviewing(true);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('chapter_id', chapter.id);
      const res = await fetch('/api/alumni/import/preview', { method: 'POST', body: formData });
      const json = await res.json();
      if (json.error) {
        showToast(json.error.message || 'Preview failed', 'error');
      } else {
        setPreviewData(json.data);
      }
    } catch {
      showToast('Preview failed', 'error');
    } finally {
      setPreviewing(false);
    }
  }

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
        setPreviewData(null);
        showToast(`✓ Imported ${json.data.imported}, skipped ${json.data.skipped}, duplicates ${json.data.duplicates}`, 'success');
        fetchStats();
      }
    } catch {
      showToast('Import failed', 'error');
    } finally {
      setImporting(false);
    }
  }

  function resetImport() {
    setImportFile(null);
    setPreviewData(null);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function saveLinks() {
    setSavingLinks(true);
    try {
      const res = await fetch(`/api/chapters/${chapter.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alumni_join_link: alumniJoinLink || null,
          actives_join_link: activesJoinLink || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error || 'Failed to save links', 'error');
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '40px 0', color: CS_UI.textMuted }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
        Loading alumni stats…
      </div>
    );
  }

  const responseRate = stats && stats.contacted > 0
    ? Math.round((stats.responded / stats.contacted) * 100)
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      <section>
        <h3 style={SECTION_TITLE}>Import Alumni List</h3>

        {!importResult && (
          <div style={{ ...CS_CARD, padding: '14px 16px' }}>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f && f.name.endsWith('.csv')) handleFileSelect(f);
                else if (f) showToast('Please drop a CSV file', 'error');
              }}
              style={{
                border: `2px dashed ${dragOver ? CS_UI.blue : CS_UI.border}`,
                borderRadius: 12,
                padding: '24px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                background: dragOver ? CS_UI.blueBg : CS_UI.surfaceMuted,
                transition: 'all 0.15s ease',
                marginBottom: 12,
              }}
            >
              <Upload size={22} style={{ color: CS_UI.textSubtle, marginBottom: 8 }} />
              <div style={{ fontSize: '0.875rem', color: CS_UI.textSecondary, fontWeight: 500, marginBottom: 4 }}>
                Drop your alumni list here or click to browse
              </div>
              <div style={{ fontSize: '0.75rem', color: CS_UI.textSubtle }}>
                Supports any CSV format — first_name, last_name, phone, email, year
              </div>
            </div>

            <input
              type="file"
              accept=".csv"
              ref={fileInputRef}
              onChange={e => handleFileSelect(e.target.files?.[0] || null)}
              style={{ display: 'none' }}
            />

            {importFile && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: '0.8125rem', color: CS_UI.text, fontWeight: 500 }}>
                    {importFile.name}
                  </div>
                  <button
                    onClick={resetImport}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 2 }}
                    title="Remove file"
                  >
                    <X size={14} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={previewing}
                  style={{ ...TOOLBAR_BUTTON_PRIMARY, padding: '0 16px', flexShrink: 0 }}
                >
                  {previewing
                    ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite', marginRight: 6 }} />Analyzing…</>
                    : 'Preview Import →'
                  }
                </button>
              </div>
            )}
          </div>
        )}

        {/* Import success result */}
        {importResult && (
          <div style={{ ...CS_CARD, padding: '14px 16px' }}>
            <div style={{ padding: '10px 14px', background: '#ecfdf5', borderRadius: 8, border: '1px solid #6ee7b7', fontSize: '0.8125rem', color: CS_UI.success, marginBottom: 10 }}>
              ✓ Imported <strong>{importResult.imported}</strong>, skipped <strong>{importResult.skipped}</strong>, duplicates <strong>{importResult.duplicates}</strong>
              {importResult.errors && importResult.errors.length > 0 && (
                <div style={{ marginTop: 4, color: '#92400e' }}>
                  {importResult.errors.slice(0, 3).map(e => <div key={e.row}>Row {e.row}: {e.message}</div>)}
                </div>
              )}
            </div>
            <button type="button" onClick={resetImport} style={TOOLBAR_BUTTON}>
              Import Another File
            </button>
          </div>
        )}

        {/* Step 2: Preview modal */}
        {previewData && !importResult && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 24,
          }}>
            <div style={{ ...CS_CARD, maxWidth: 600, width: '100%', maxHeight: '90vh', overflowY: 'auto', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
              <div style={{ padding: '16px 20px', borderBottom: `1px solid ${CS_UI.border}` }}>
                <div style={{ fontSize: '1rem', fontWeight: 600, color: CS_UI.text, marginBottom: 2 }}>
                  Smart Import Preview
                </div>
                <div style={{ fontSize: '0.75rem', color: CS_UI.textSubtle }}>{importFile?.name}</div>
              </div>

              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Column mapping */}
                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 10 }}>
                    Column Mapping
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {previewData.detected_columns.map((col, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.84rem' }}>
                        <span style={{ color: col.mapped_to ? '#059669' : '#9ca3af', fontWeight: 700, fontSize: '0.9rem', width: 16 }}>
                          {col.mapped_to ? '✓' : '✗'}
                        </span>
                        <span style={{ color: CS_UI.text, fontFamily: 'monospace', background: CS_UI.surfaceMuted, padding: '1px 6px', borderRadius: 4, fontSize: '0.8rem' }}>
                          &ldquo;{col.raw_header}&rdquo;
                        </span>
                        <span style={{ color: '#9ca3af' }}>→</span>
                        <span style={{ color: col.mapped_to ? CS_UI.text : CS_UI.textSubtle, fontSize: '0.8125rem' }}>
                          {col.mapped_to || '(ignored)'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sample contacts */}
                {previewData.sample_rows.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 10 }}>
                      Sample Contacts (first {previewData.sample_rows.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {previewData.sample_rows.map((row, i) => (
                        <div key={i} style={{ fontSize: '0.8125rem', color: CS_UI.text, background: CS_UI.surfaceMuted, padding: '8px 12px', borderRadius: 8 }}>
                          <strong>{row.first_name} {row.last_name}</strong>
                          {row.year && <span style={{ color: '#9ca3af', marginLeft: 8 }}>&lsquo;{String(row.year).slice(-2)}</span>}
                          {row.phone_primary && <span style={{ color: '#5C5449', marginLeft: 8 }}>• {row.phone_primary}</span>}
                          {!row.phone_primary && <span style={{ color: '#D9D4CC', marginLeft: 8 }}>• no phone</span>}
                          {row.email && <span style={{ color: '#5C5449', marginLeft: 8 }}>• {row.email}</span>}
                          {!row.email && <span style={{ color: '#D9D4CC', marginLeft: 8 }}>• —</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Import summary */}
                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 10 }}>
                    Import Summary
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.84rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#059669', fontWeight: 600 }}>
                      <span>✓ Will import</span>
                      <span>{previewData.counts.will_import.toLocaleString()} contacts</span>
                    </div>
                    {previewData.counts.skip_pre_1970 > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280' }}>
                        <span>— Skip pre-1970</span>
                        <span>{previewData.counts.skip_pre_1970.toLocaleString()} contacts</span>
                      </div>
                    )}
                    {previewData.counts.duplicates > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280' }}>
                        <span>— Duplicates</span>
                        <span>{previewData.counts.duplicates.toLocaleString()} contacts</span>
                      </div>
                    )}
                    {previewData.counts.skip_no_name > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280' }}>
                        <span>— Missing name</span>
                        <span>{previewData.counts.skip_no_name.toLocaleString()} contacts</span>
                      </div>
                    )}
                    {previewData.counts.skip_invalid_phone > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280' }}>
                        <span>— Invalid phone</span>
                        <span>{previewData.counts.skip_invalid_phone.toLocaleString()} contacts</span>
                      </div>
                    )}
                    <div style={{ borderTop: `1px solid ${CS_UI.border}`, paddingTop: 6, display: 'flex', justifyContent: 'space-between', color: CS_UI.textSubtle }}>
                      <span>Total rows</span>
                      <span>{previewData.counts.total_rows.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Warnings */}
                {previewData.warnings.length > 0 && (
                  <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 2, padding: '10px 14px' }}>
                    {previewData.warnings.map((w, i) => (
                      <div key={i} style={{ fontSize: '0.82rem', color: '#92400e', marginBottom: i < previewData.warnings.length - 1 ? 6 : 0 }}>
                        ⚠️ {w}
                      </div>
                    ))}
                  </div>
                )}

                {/* Required fields missing */}
                {!previewData.has_required_fields && (
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 2, padding: '10px 14px', fontSize: '0.82rem', color: '#991B1B' }}>
                    ✕ Missing required columns: need first_name + last_name (or a full name column). Cannot import.
                  </div>
                )}
              </div>

              {/* Modal footer */}
              <div style={{ padding: '14px 20px', borderTop: `1px solid ${CS_UI.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button type="button" onClick={() => setPreviewData(null)} style={TOOLBAR_BUTTON}>Cancel</button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importing || !previewData.has_required_fields || previewData.counts.will_import === 0}
                  style={{ ...TOOLBAR_BUTTON_PRIMARY, padding: '0 18px' }}
                >
                  {importing
                    ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite', marginRight: 6 }} />Importing…</>
                    : `Import ${previewData.counts.will_import.toLocaleString()} Contact${previewData.counts.will_import === 1 ? '' : 's'} →`
                  }
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <section>
        <h3 style={SECTION_TITLE}>Import Stats</h3>
        {stats ? (
          <div style={{
            display: 'flex',
            alignItems: 'stretch',
            width: '100%',
            paddingBottom: 4,
            borderBottom: `1px solid ${CS_UI.border}`,
          }}>
            {[
              { label: 'Total Alumni', value: stats.total, icon: <Users size={14} /> },
              { label: 'Have Email', value: stats.have_email ?? '—', icon: <Mail size={14} /> },
              { label: 'Have Phone', value: stats.have_phone, icon: <Phone size={14} /> },
              { label: 'Mobile (iMsg)', value: stats.imessage, icon: <Smartphone size={14} /> },
            ].map((s, index) => (
              <React.Fragment key={s.label}>
                {index > 0 && (
                  <div aria-hidden style={{ width: 1, alignSelf: 'stretch', margin: '4px 0', background: CS_UI.border, flexShrink: 0 }} />
                )}
                <div style={{ flex: '1 1 0', padding: '0 12px', minWidth: 0, textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', color: CS_UI.textSubtle, marginBottom: 4 }}>{s.icon}</div>
                  <p style={{ margin: 0, fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: CS_UI.textSubtle }}>{s.label}</p>
                  <p style={{ margin: '4px 0 0', fontSize: '1.25rem', fontWeight: 700, color: CS_UI.text, fontVariantNumeric: 'tabular-nums' }}>{s.value}</p>
                </div>
              </React.Fragment>
            ))}
          </div>
        ) : (
          <div style={{ color: CS_UI.textSubtle, fontSize: '0.8125rem' }}>No import data yet.</div>
        )}
      </section>

      <section>
        <h3 style={SECTION_TITLE}>Linq Pipeline</h3>
        {stats ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {[
                { label: 'Contacted', value: stats.contacted },
                { label: 'Responded', value: stats.responded },
                { label: 'Signed Up', value: stats.signed_up },
              ].map((item, i, arr) => (
                <React.Fragment key={item.label}>
                  <div style={{ ...CS_CARD, padding: '10px 14px', minWidth: 88, textAlign: 'center' }}>
                    <div style={{ fontSize: '1.125rem', fontWeight: 700, color: CS_UI.text, fontVariantNumeric: 'tabular-nums' }}>{item.value}</div>
                    <div style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: CS_UI.textSubtle, marginTop: 2 }}>{item.label}</div>
                  </div>
                  {i < arr.length - 1 && <span style={{ color: CS_UI.textSubtle, fontSize: '0.875rem' }}>→</span>}
                </React.Fragment>
              ))}
              <div style={{ ...CS_CARD, padding: '10px 14px', marginLeft: 4 }}>
                <div style={{ fontSize: '1.125rem', fontWeight: 700, color: CS_UI.text }}>{responseRate}%</div>
                <div style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: CS_UI.textSubtle, marginTop: 2 }}>Response Rate</div>
              </div>
            </div>

            {/* Touch queue badges */}
            {(stats.touch1_ready > 0 || stats.touch2_due > 0 || stats.touch3_due > 0) && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {stats.touch1_ready > 0 && (
                  <span style={{ ...LIST_PILL, color: CS_UI.warning, background: '#fffbeb', border: '1px solid #fde68a' }}>
                    {stats.touch1_ready} ready for Touch 1
                  </span>
                )}
                {stats.touch2_due > 0 && (
                  <span style={{ ...LIST_PILL, color: CS_UI.warning, background: '#fffbeb', border: '1px solid #fde68a' }}>
                    {stats.touch2_due} due Touch 2
                  </span>
                )}
                {stats.touch3_due > 0 && (
                  <span style={{ ...LIST_PILL, color: CS_UI.textSecondary, background: NEUTRAL_BADGE.bg, border: `1px solid ${NEUTRAL_BADGE.border}` }}>
                    {stats.touch3_due} due Touch 3
                  </span>
                )}
              </div>
            )}

            <Link
              href={`/dashboard/clients/${chapter.id}/alumni`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', color: CS_UI.blueDark, fontWeight: 600, textDecoration: 'none' }}
            >
              View Full Alumni List <ExternalLink size={13} />
            </Link>
          </div>
        ) : (
          <div style={{ color: CS_UI.textSubtle, fontSize: '0.8125rem' }}>No pipeline data yet.</div>
        )}
      </section>

      <section>
        <h3 style={SECTION_TITLE}>Signup Links</h3>
        <div style={{ ...CS_CARD, padding: '14px 16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: CS_UI.textMuted, display: 'block', marginBottom: 4 }}>Alumni Join Link</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="url" value={alumniJoinLink} onChange={e => setAlumniJoinLink(e.target.value)} placeholder="https://trailblaize.net/join/..." style={INPUT_STYLE} />
                <button type="button" onClick={() => alumniJoinLink && copyToClipboard(alumniJoinLink, 'alumni')} disabled={!alumniJoinLink} title="Copy link" style={{ ...TOOLBAR_BUTTON, padding: '0 10px', opacity: alumniJoinLink ? 1 : 0.5 }}>
                  {copiedAlumni ? <Check size={15} color={CS_UI.success} /> : <Copy size={15} />}
                </button>
              </div>
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: CS_UI.textMuted, display: 'block', marginBottom: 4 }}>Actives Join Link</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="url" value={activesJoinLink} onChange={e => setActivesJoinLink(e.target.value)} placeholder="https://trailblaize.net/join/..." style={INPUT_STYLE} />
                <button type="button" onClick={() => activesJoinLink && copyToClipboard(activesJoinLink, 'actives')} disabled={!activesJoinLink} title="Copy link" style={{ ...TOOLBAR_BUTTON, padding: '0 10px', opacity: activesJoinLink ? 1 : 0.5 }}>
                  {copiedActives ? <Check size={15} color={CS_UI.success} /> : <Copy size={15} />}
                </button>
              </div>
            </div>
          </div>
          <button type="button" onClick={saveLinks} disabled={savingLinks} style={{ ...TOOLBAR_BUTTON_PRIMARY, marginTop: 12 }}>
            {savingLinks ? 'Saving…' : 'Save Links'}
          </button>
        </div>
      </section>

      <section>
        <h3 style={SECTION_TITLE}>Email Status</h3>
        <div style={{ ...DETAIL_PILL, padding: '6px 12px', color: emailSequenceLive ? CS_UI.success : CS_UI.textMuted, background: emailSequenceLive ? '#ecfdf5' : NEUTRAL_BADGE.bg, border: `1px solid ${emailSequenceLive ? '#6ee7b7' : NEUTRAL_BADGE.border}` }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: emailSequenceLive ? CS_UI.success : CS_UI.textSubtle }} />
          SendGrid Sequence: {emailSequenceLive ? 'Live' : 'Not set up'}
        </div>
        {!emailSequenceLive && (
          <p style={{ marginTop: 8, fontSize: '0.75rem', color: CS_UI.textSubtle }}>
            Mark &quot;SendGrid sequence live&quot; in Set Up to track this.
          </p>
        )}
      </section>
    </div>
  );
}
