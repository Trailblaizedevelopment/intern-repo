'use client';

import React, { useState, useRef, useCallback } from 'react';
import { X, Upload, Download, CheckCircle, AlertCircle, SkipForward, Loader2 } from 'lucide-react';

/* ─── Types ─── */
interface CsvRow {
  org_name: string;
  org_type: string;
  school_name?: string;
  national_org_name?: string;
  stage?: string;
  temperature?: string;
  value?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  contact_role?: string;
  conference?: string;
  notes?: string;
  assigned_to?: string;
  next_followup?: string;
  // raw row for display
  [key: string]: string | undefined;
}

interface ImportResult {
  row: number;
  org_name: string;
  status: 'created' | 'skipped' | 'error';
  deal_id?: string;
  reason?: string;
}

interface Props {
  onClose: () => void;
  onImported: (count: number) => void;
}

/* ─── CSV Parser ─── */
function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  function splitLine(line: string): string[] {
    const cells: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        cells.push(cur.trim()); cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    return cells;
  }

  const headers = splitLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
  const rows = lines.slice(1).map(line => {
    const cells = splitLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = cells[i] || ''; });
    return obj;
  });

  return { headers, rows };
}

/* ─── Sample CSV ─── */
const SAMPLE_CSV = `org_name,org_type,school_name,national_org_name,stage,temperature,value,contact_name,contact_phone,contact_email,contact_role,conference,notes,assigned_to,next_followup
Sigma Alpha Epsilon at Alabama,fraternity,University of Alabama,Sigma Alpha Epsilon,lead,warm,3588,John Smith,205-555-0100,john@ua.edu,president,SEC,,Owen,2026-04-10
IFC University of Alabama,council,University of Alabama,,first_demo,hot,45000,Jane Doe,205-555-0101,jane@ua.edu,fsl_director,SEC,Interested in full suite,,2026-04-08
Sigma Alpha Epsilon HQ,national,,Sigma Alpha Epsilon,demo_booked,warm,250000,HQ Rep,212-555-0200,rep@sae.net,board_member,,National partnership discussion,Adam,2026-04-15`;

/* ─── Field Guide ─── */
const FIELD_GUIDE = [
  { field: 'org_name', required: true, desc: 'Organization name (e.g. "SAE at Alabama")' },
  { field: 'org_type', required: true, desc: 'fraternity | sorority | council | national | sports | other' },
  { field: 'school_name', required: false, desc: 'Must match a school in the system (fuzzy match)' },
  { field: 'national_org_name', required: false, desc: 'For fraternity/sorority — e.g. "Sigma Alpha Epsilon" or "SAE"' },
  { field: 'stage', required: false, desc: 'lead | demo_booked | first_demo | second_call | contract_sent | closed_won (default: lead)' },
  { field: 'temperature', required: false, desc: 'hot | warm | cold (default: warm)' },
  { field: 'value', required: false, desc: 'Numeric deal value in dollars (default: 0)' },
  { field: 'contact_name', required: false, desc: 'Primary contact full name' },
  { field: 'contact_phone', required: false, desc: 'Contact phone number' },
  { field: 'contact_email', required: false, desc: 'Contact email address' },
  { field: 'contact_role', required: false, desc: 'president | advisor | fsl_director | board_member | other' },
  { field: 'conference', required: false, desc: 'Conference override (e.g. SEC, ACC, Big Ten)' },
  { field: 'notes', required: false, desc: 'Deal notes' },
  { field: 'assigned_to', required: false, desc: 'Employee name (e.g. "Owen" or "Adam")' },
  { field: 'next_followup', required: false, desc: 'Follow-up date in YYYY-MM-DD format' },
];

/* ─── Component ─── */
export default function BulkDealImportModal({ onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  type Step = 'upload' | 'preview' | 'importing' | 'done';
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<CsvRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [importStats, setImportStats] = useState({ created: 0, skipped: 0, errors: 0 });
  const [showGuide, setShowGuide] = useState(false);

  /* Handle file */
  const processFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      alert('Please upload a .csv file');
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers: h, rows } = parseCsv(text);
      if (rows.length === 0) { alert('No data rows found in CSV'); return; }
      setHeaders(h);
      setParsedRows(rows as CsvRow[]);
      setStep('preview');
    };
    reader.readAsText(file);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  /* Download sample */
  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trailblaize-deal-import-template.csv';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* Run import */
  async function runImport() {
    setStep('importing');
    try {
      const res = await fetch('/api/pipeline/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: parsedRows, skipDuplicates }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Import failed: ${err.error}`);
        setStep('preview');
        return;
      }
      const data = await res.json();
      setResults(data.results);
      setImportStats({ created: data.created, skipped: data.skipped, errors: data.errors });
      setStep('done');
      if (data.created > 0) onImported(data.created);
    } catch {
      alert('Import request failed. Please try again.');
      setStep('preview');
    }
  }

  /* ─── Status icon ─── */
  function StatusIcon({ status }: { status: ImportResult['status'] }) {
    if (status === 'created') return <CheckCircle size={14} style={{ color: '#10b981', flexShrink: 0 }} />;
    if (status === 'skipped') return <SkipForward size={14} style={{ color: '#6b7280', flexShrink: 0 }} />;
    return <AlertCircle size={14} style={{ color: '#ef4444', flexShrink: 0 }} />;
  }

  return (
    <>
      <div className="bdi__overlay" onClick={onClose} />
      <div className="bdi__modal">
        {/* Header */}
        <div className="bdi__header">
          <div>
            <h2 className="bdi__title">
              {step === 'upload' && 'Import Deals from CSV'}
              {step === 'preview' && `Preview — ${parsedRows.length} rows`}
              {step === 'importing' && 'Importing…'}
              {step === 'done' && 'Import Complete'}
            </h2>
            {step === 'preview' && (
              <p className="bdi__subtitle">{fileName}</p>
            )}
          </div>
          <button className="bdi__close" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Body */}
        <div className="bdi__body">

          {/* ── Upload Step ── */}
          {step === 'upload' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Drop zone */}
              <div
                className={`bdi__dropzone ${dragOver ? 'bdi__dropzone--active' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={32} style={{ color: '#C9A84C', marginBottom: 8 }} />
                <div className="bdi__drop-title">Drop your CSV here or click to browse</div>
                <div className="bdi__drop-sub">Supports .csv files up to 500 rows</div>
                <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleFileChange} />
              </div>

              {/* Actions row */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="bdi__btn bdi__btn--accent" onClick={downloadSample}>
                  <Download size={14} /> Download Template
                </button>
                <button className="bdi__btn" onClick={() => setShowGuide(v => !v)}>
                  {showGuide ? '▾' : '▸'} Field Guide
                </button>
              </div>

              {/* Field Guide */}
              {showGuide && (
                <div className="bdi__guide">
                  <div className="bdi__guide-title">CSV Field Reference</div>
                  {FIELD_GUIDE.map(f => (
                    <div key={f.field} className="bdi__guide-row">
                      <span className="bdi__guide-field">
                        {f.field}
                        {f.required && <span className="bdi__required"> *</span>}
                      </span>
                      <span className="bdi__guide-desc">{f.desc}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Preview Step ── */}
          {step === 'preview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Options */}
              <div className="bdi__options-row">
                <label className="bdi__checkbox-label">
                  <input
                    type="checkbox"
                    checked={skipDuplicates}
                    onChange={e => setSkipDuplicates(e.target.checked)}
                    style={{ accentColor: '#C9A84C' }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Skip duplicates</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--ws-text-secondary,#6b7280)' }}>
                      If an org already has an active deal, skip that row
                    </div>
                  </div>
                </label>
              </div>

              {/* Preview table */}
              <div className="bdi__table-wrap">
                <table className="bdi__table">
                  <thead>
                    <tr>
                      <th>#</th>
                      {headers.slice(0, 7).map(h => <th key={h}>{h}</th>)}
                      {headers.length > 7 && <th>+{headers.length - 7} more</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.slice(0, 20).map((row, i) => (
                      <tr key={i} className={!row.org_name?.trim() ? 'bdi__row--error' : ''}>
                        <td className="bdi__row-num">{i + 1}</td>
                        {headers.slice(0, 7).map(h => (
                          <td key={h} title={row[h] || ''}>
                            {row[h] ? (
                              <span className="bdi__cell-val">{row[h]}</span>
                            ) : (
                              <span className="bdi__cell-empty">—</span>
                            )}
                          </td>
                        ))}
                        {headers.length > 7 && <td className="bdi__cell-empty">…</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedRows.length > 20 && (
                  <div className="bdi__table-more">
                    + {parsedRows.length - 20} more rows not shown
                  </div>
                )}
              </div>

              <div style={{ fontSize: '0.8125rem', color: 'var(--ws-text-secondary,#6b7280)' }}>
                {parsedRows.length} row{parsedRows.length !== 1 ? 's' : ''} ready to import
              </div>
            </div>
          )}

          {/* ── Importing Step ── */}
          {step === 'importing' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '40px 0' }}>
              <Loader2 size={40} style={{ color: '#C9A84C', animation: 'spin 1s linear infinite' }} />
              <div style={{ fontWeight: 600, fontSize: '1rem' }}>Importing {parsedRows.length} rows…</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--ws-text-secondary,#6b7280)' }}>
                Creating orgs, contacts, and deals. This may take a moment.
              </div>
            </div>
          )}

          {/* ── Done Step ── */}
          {step === 'done' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Summary */}
              <div className="bdi__summary">
                <div className="bdi__summary-stat bdi__summary-stat--green">
                  <CheckCircle size={20} />
                  <div>
                    <div className="bdi__summary-num">{importStats.created}</div>
                    <div className="bdi__summary-label">Created</div>
                  </div>
                </div>
                <div className="bdi__summary-stat bdi__summary-stat--gray">
                  <SkipForward size={20} />
                  <div>
                    <div className="bdi__summary-num">{importStats.skipped}</div>
                    <div className="bdi__summary-label">Skipped</div>
                  </div>
                </div>
                {importStats.errors > 0 && (
                  <div className="bdi__summary-stat bdi__summary-stat--red">
                    <AlertCircle size={20} />
                    <div>
                      <div className="bdi__summary-num">{importStats.errors}</div>
                      <div className="bdi__summary-label">Errors</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Row-by-row results */}
              <div className="bdi__results-list">
                {results.map(r => (
                  <div key={r.row} className={`bdi__result-row bdi__result-row--${r.status}`}>
                    <StatusIcon status={r.status} />
                    <span className="bdi__result-row-num">#{r.row}</span>
                    <span className="bdi__result-org">{r.org_name}</span>
                    {r.reason && <span className="bdi__result-reason">{r.reason}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bdi__footer">
          {step === 'upload' && (
            <button className="bdi__btn" onClick={onClose}>Cancel</button>
          )}
          {step === 'preview' && (
            <>
              <button className="bdi__btn" onClick={() => setStep('upload')}>← Back</button>
              <button className="bdi__btn bdi__btn--primary" onClick={runImport}>
                Import {parsedRows.length} Deal{parsedRows.length !== 1 ? 's' : ''}
              </button>
            </>
          )}
          {step === 'done' && (
            <button className="bdi__btn bdi__btn--primary" onClick={onClose} style={{ flex: 1 }}>
              Done
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .bdi__overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5);
          z-index: 9998; backdrop-filter: blur(2px);
        }
        .bdi__modal {
          position: fixed; bottom: 0; left: 0; right: 0;
          background: var(--ws-surface, #fff);
          border-radius: 20px 20px 0 0;
          z-index: 9999;
          display: flex; flex-direction: column;
          max-height: 92dvh;
          box-shadow: 0 -8px 40px rgba(0,0,0,0.2);
        }
        @media (min-width: 640px) {
          .bdi__modal {
            top: 50%; left: 50%; right: auto; bottom: auto;
            transform: translate(-50%, -50%);
            width: 660px; max-height: 88vh;
            border-radius: 16px;
          }
        }
        .bdi__header {
          display: flex; align-items: flex-start; justify-content: space-between;
          padding: 20px 20px 12px;
          border-bottom: 1px solid var(--ws-border, #e5e7eb);
          flex-shrink: 0;
        }
        .bdi__title { font-size: 1.125rem; font-weight: 700; margin: 0 0 2px; }
        .bdi__subtitle { font-size: 0.8125rem; color: var(--ws-text-secondary, #6b7280); margin: 0; }
        .bdi__close {
          background: none; border: none; cursor: pointer;
          padding: 4px; color: var(--ws-text-secondary, #6b7280); border-radius: 8px; flex-shrink: 0;
        }
        .bdi__body {
          flex: 1; overflow-y: auto; padding: 20px;
        }
        .bdi__footer {
          display: flex; gap: 10px; padding: 14px 20px;
          border-top: 1px solid var(--ws-border, #e5e7eb); flex-shrink: 0;
        }
        .bdi__btn {
          flex: 1; padding: 11px 16px; border-radius: 10px;
          border: 1.5px solid var(--ws-border, #e5e7eb);
          background: var(--ws-surface, #fff);
          font-size: 0.9rem; font-weight: 500; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 6px;
        }
        .bdi__btn--primary {
          background: #C9A84C; border-color: #C9A84C; color: #fff; font-weight: 600;
        }
        .bdi__btn--accent {
          background: #C9A84C18; border-color: #C9A84C; color: #C9A84C; font-weight: 500;
        }

        /* Drop zone */
        .bdi__dropzone {
          border: 2px dashed var(--ws-border, #e5e7eb);
          border-radius: 14px;
          padding: 48px 24px;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          cursor: pointer; transition: border-color 0.15s, background 0.15s;
          text-align: center;
        }
        .bdi__dropzone:hover, .bdi__dropzone--active {
          border-color: #C9A84C; background: #C9A84C08;
        }
        .bdi__drop-title { font-size: 0.9375rem; font-weight: 600; margin-bottom: 4px; }
        .bdi__drop-sub { font-size: 0.8125rem; color: var(--ws-text-secondary, #6b7280); }

        /* Field guide */
        .bdi__guide {
          background: var(--ws-bg, #f9fafb);
          border: 1px solid var(--ws-border, #e5e7eb);
          border-radius: 10px; padding: 14px 16px;
          display: flex; flex-direction: column; gap: 8px;
        }
        .bdi__guide-title { font-size: 0.8125rem; font-weight: 700; margin-bottom: 2px; }
        .bdi__guide-row {
          display: flex; gap: 12px; flex-wrap: wrap;
          padding: 6px 0; border-top: 1px solid var(--ws-border, #e5e7eb);
        }
        .bdi__guide-field {
          font-size: 0.8rem; font-family: monospace; font-weight: 600;
          color: #C9A84C; min-width: 140px; flex-shrink: 0;
        }
        .bdi__guide-desc { font-size: 0.8rem; color: var(--ws-text-secondary, #6b7280); }
        .bdi__required { color: #ef4444; }

        /* Options */
        .bdi__options-row {
          padding: 12px 14px;
          background: var(--ws-bg, #f9fafb);
          border: 1px solid var(--ws-border, #e5e7eb);
          border-radius: 10px;
        }
        .bdi__checkbox-label {
          display: flex; align-items: flex-start; gap: 10px; cursor: pointer;
        }

        /* Preview table */
        .bdi__table-wrap {
          overflow-x: auto; border: 1px solid var(--ws-border, #e5e7eb);
          border-radius: 10px; overflow: hidden;
        }
        .bdi__table {
          width: 100%; border-collapse: collapse; font-size: 0.75rem;
        }
        .bdi__table th {
          background: var(--ws-bg, #f9fafb);
          padding: 8px 10px;
          text-align: left; font-weight: 600;
          border-bottom: 1px solid var(--ws-border, #e5e7eb);
          white-space: nowrap; font-size: 0.7rem; color: var(--ws-text-secondary, #6b7280);
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .bdi__table td {
          padding: 7px 10px;
          border-bottom: 1px solid var(--ws-border, #e5e7eb);
          max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .bdi__table tr:last-child td { border-bottom: none; }
        .bdi__table tr:hover td { background: var(--ws-bg, #f9fafb); }
        .bdi__row--error td { background: #fef2f2 !important; }
        .bdi__row-num { color: var(--ws-text-secondary, #9ca3af); font-weight: 600; font-size: 0.7rem; width: 28px; }
        .bdi__cell-val { color: var(--ws-text, #111827); }
        .bdi__cell-empty { color: var(--ws-text-secondary, #d1d5db); }
        .bdi__table-more {
          padding: 8px 12px; font-size: 0.75rem;
          color: var(--ws-text-secondary, #6b7280);
          background: var(--ws-bg, #f9fafb);
          text-align: center;
        }

        /* Summary */
        .bdi__summary {
          display: flex; gap: 12px; flex-wrap: wrap;
        }
        .bdi__summary-stat {
          flex: 1; min-width: 100px;
          display: flex; align-items: center; gap: 10px;
          padding: 14px 16px; border-radius: 12px;
        }
        .bdi__summary-stat--green { background: #d1fae5; color: #065f46; }
        .bdi__summary-stat--gray { background: var(--ws-bg, #f3f4f6); color: var(--ws-text-secondary, #6b7280); }
        .bdi__summary-stat--red { background: #fee2e2; color: #991b1b; }
        .bdi__summary-num { font-size: 1.5rem; font-weight: 800; line-height: 1; }
        .bdi__summary-label { font-size: 0.75rem; font-weight: 500; margin-top: 2px; }

        /* Results list */
        .bdi__results-list {
          display: flex; flex-direction: column; gap: 4px;
          max-height: 300px; overflow-y: auto;
          border: 1px solid var(--ws-border, #e5e7eb);
          border-radius: 10px; overflow: hidden;
        }
        .bdi__result-row {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 12px; font-size: 0.8125rem;
          border-bottom: 1px solid var(--ws-border, #e5e7eb);
          overflow-y: auto;
        }
        .bdi__result-row:last-child { border-bottom: none; }
        .bdi__result-row--created { background: #f0fdf4; }
        .bdi__result-row--skipped { background: var(--ws-surface, #fff); }
        .bdi__result-row--error { background: #fef2f2; }
        .bdi__result-row-num { font-size: 0.7rem; color: var(--ws-text-secondary, #9ca3af); font-weight: 600; flex-shrink: 0; }
        .bdi__result-org { flex: 1; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .bdi__result-reason { font-size: 0.75rem; color: #ef4444; flex-shrink: 0; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      `}</style>
    </>
  );
}
