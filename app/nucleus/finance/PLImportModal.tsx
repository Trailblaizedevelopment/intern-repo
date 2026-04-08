'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  X,
  Upload,
  FileText,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  Download,
  Trash2,
  ChevronDown,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { ExpenseCategory, ImportBatch } from '@/lib/supabase';
import ModalOverlay from '@/components/ModalOverlay';

interface Payment {
  id: string;
  amount: number;
  payment_date: string;
  chapter?: { chapter_name: string };
}

interface ParsedRow {
  date: string;
  description: string;
  amount: number;
  type: 'revenue' | 'expense';
  category: ExpenseCategory | null;
  included: boolean;
  duplicateOf: string | null;
}

type MappingField = 'date' | 'description' | 'amount' | 'type' | 'debit' | 'credit' | 'skip';

interface PLImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
  existingPayments: Payment[];
  existingBatches: ImportBatch[];
}

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  software: 'Software', travel: 'Travel', legal: 'Legal',
  marketing: 'Marketing', payroll: 'Payroll', office: 'Office', other: 'Other',
};

const VENDOR_KEYWORDS: [string, ExpenseCategory][] = [
  ['aws', 'software'], ['vercel', 'software'], ['github', 'software'], ['heroku', 'software'],
  ['google cloud', 'software'], ['openai', 'software'], ['supabase', 'software'], ['stripe', 'software'],
  ['slack', 'software'], ['notion', 'software'], ['figma', 'software'], ['linear', 'software'],
  ['zoom', 'software'], ['microsoft', 'software'], ['adobe', 'software'], ['netlify', 'software'],
  ['delta', 'travel'], ['united', 'travel'], ['american airlines', 'travel'], ['southwest', 'travel'],
  ['uber', 'travel'], ['lyft', 'travel'], ['airbnb', 'travel'], ['hotel', 'travel'], ['marriott', 'travel'],
  ['legal', 'legal'], ['attorney', 'legal'], ['law firm', 'legal'], ['law office', 'legal'],
  ['facebook ads', 'marketing'], ['google ads', 'marketing'], ['ad spend', 'marketing'],
  ['mailchimp', 'marketing'], ['hubspot', 'marketing'], ['advertising', 'marketing'],
  ['salary', 'payroll'], ['payroll', 'payroll'], ['contractor', 'payroll'],
  ['freelance', 'payroll'], ['gusto', 'payroll'], ['deel', 'payroll'],
  ['office', 'office'], ['supplies', 'office'], ['staples', 'office'], ['amazon', 'office'],
  ['wework', 'office'], ['coworking', 'office'],
];

function autoDetectCategory(description: string): ExpenseCategory {
  const lower = description.toLowerCase();
  for (const [keyword, category] of VENDOR_KEYWORDS) {
    if (lower.includes(keyword)) return category;
  }
  return 'other';
}

function autoDetectMapping(headers: string[]): Record<number, MappingField> {
  const map: Record<number, MappingField> = {};
  const lowerHeaders = headers.map(h => h.toLowerCase().trim());

  for (let i = 0; i < lowerHeaders.length; i++) {
    const h = lowerHeaders[i];
    if (!h) { map[i] = 'skip'; continue; }

    if (/^(date|transaction.?date|posted|trans.?date)$/i.test(h)) {
      map[i] = 'date';
    } else if (/^(description|vendor|merchant|memo|name|payee|details)$/i.test(h)) {
      map[i] = 'description';
    } else if (/^(amount|total|net)$/i.test(h)) {
      map[i] = 'amount';
    } else if (/^(debit|withdrawal|expense)$/i.test(h)) {
      map[i] = 'debit';
    } else if (/^(credit|deposit|income|revenue)$/i.test(h)) {
      map[i] = 'credit';
    } else if (/^(type|category|class)$/i.test(h)) {
      map[i] = 'type';
    } else {
      map[i] = 'skip';
    }
  }
  return map;
}

function parseDate(val: unknown): string | null {
  if (!val) return null;

  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }

  const str = String(val).trim();
  const iso = Date.parse(str);
  if (!isNaN(iso)) {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const parts = str.split(/[\/\-\.]/);
  if (parts.length === 3) {
    let [a, b, c] = parts.map(Number);
    if (a > 31) return `${a}-${String(b).padStart(2, '0')}-${String(c).padStart(2, '0')}`;
    if (c > 31) return `${c}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`;
  }

  return null;
}

function parseAmount(val: unknown): number | null {
  if (typeof val === 'number') return val;
  if (!val) return null;
  const str = String(val).replace(/[$,\s]/g, '').replace(/\((.+)\)/, '-$1');
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

export default function PLImportModal({
  isOpen,
  onClose,
  onImportComplete,
  existingPayments,
  existingBatches,
}: PLImportModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [fileName, setFileName] = useState('');
  const [rawData, setRawData] = useState<unknown[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<Record<number, MappingField>>({});
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);

  const existingBatch = useMemo(
    () => existingBatches.find(b => b.year === selectedYear && b.month === selectedMonth),
    [existingBatches, selectedYear, selectedMonth]
  );

  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  function reset() {
    setStep(1);
    setFileName('');
    setRawData([]);
    setHeaders([]);
    setColumnMap({});
    setParsedRows([]);
    setImporting(false);
    setReplaceExisting(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  const handleFile = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      if (!data) return;

      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });

      const nonEmpty = json.filter(row =>
        Array.isArray(row) && row.some(cell => cell !== '' && cell != null)
      );

      if (nonEmpty.length < 2) {
        alert('File appears empty or has no data rows.');
        return;
      }

      const hdrs = (nonEmpty[0] as unknown[]).map(c => String(c ?? ''));
      const rows = nonEmpty.slice(1);

      setHeaders(hdrs);
      setRawData(rows);
      setColumnMap(autoDetectMapping(hdrs));
      setStep(2);
    };
    reader.readAsArrayBuffer(file);
  }, []);

  function applyMapping() {
    const dateCol = Object.entries(columnMap).find(([, v]) => v === 'date')?.[0];
    const descCol = Object.entries(columnMap).find(([, v]) => v === 'description')?.[0];
    const amountCol = Object.entries(columnMap).find(([, v]) => v === 'amount')?.[0];
    const typeCol = Object.entries(columnMap).find(([, v]) => v === 'type')?.[0];
    const debitCol = Object.entries(columnMap).find(([, v]) => v === 'debit')?.[0];
    const creditCol = Object.entries(columnMap).find(([, v]) => v === 'credit')?.[0];

    if (!descCol && !amountCol && !debitCol && !creditCol) {
      alert('Please map at least a Description and an Amount (or Debit/Credit) column.');
      return;
    }

    const rows: ParsedRow[] = [];
    const defaultDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;

    for (const row of rawData) {
      const cells = row as unknown[];

      const date = dateCol != null ? (parseDate(cells[Number(dateCol)]) || defaultDate) : defaultDate;
      const desc = descCol != null ? String(cells[Number(descCol)] ?? '').trim() : '';

      let amount: number | null = null;
      let entryType: 'revenue' | 'expense' = 'expense';

      if (debitCol != null || creditCol != null) {
        const debit = debitCol != null ? parseAmount(cells[Number(debitCol)]) : null;
        const credit = creditCol != null ? parseAmount(cells[Number(creditCol)]) : null;
        if (credit && credit > 0) { amount = credit; entryType = 'revenue'; }
        else if (debit && debit > 0) { amount = debit; entryType = 'expense'; }
        else if (debit && debit < 0) { amount = Math.abs(debit); entryType = 'revenue'; }
        else if (credit && credit < 0) { amount = Math.abs(credit); entryType = 'expense'; }
        else { amount = debit || credit || 0; }
      } else if (amountCol != null) {
        amount = parseAmount(cells[Number(amountCol)]);
        if (amount !== null && amount < 0) {
          entryType = 'expense';
          amount = Math.abs(amount);
        } else {
          entryType = 'revenue';
        }
      }

      if (typeCol != null) {
        const tv = String(cells[Number(typeCol)] ?? '').toLowerCase();
        if (tv.includes('revenue') || tv.includes('income') || tv.includes('credit')) entryType = 'revenue';
        else if (tv.includes('expense') || tv.includes('debit') || tv.includes('cost')) entryType = 'expense';
      }

      if (amount === null || amount === 0) continue;
      if (!desc && !date) continue;

      let duplicateOf: string | null = null;
      if (entryType === 'revenue') {
        const match = existingPayments.find(p => {
          if (Math.abs(p.amount - amount!) > 0.01) return false;
          const daysDiff = Math.abs(
            (new Date(p.payment_date).getTime() - new Date(date).getTime()) / (1000 * 60 * 60 * 24)
          );
          return daysDiff <= 3;
        });
        if (match) duplicateOf = match.chapter?.chapter_name || 'Existing payment';
      }

      rows.push({
        date,
        description: desc,
        amount,
        type: entryType,
        category: entryType === 'expense' ? autoDetectCategory(desc) : null,
        included: !duplicateOf,
        duplicateOf,
      });
    }

    setParsedRows(rows);
    setStep(3);
  }

  const summary = useMemo(() => {
    const included = parsedRows.filter(r => r.included);
    const rev = included.filter(r => r.type === 'revenue');
    const exp = included.filter(r => r.type === 'expense');
    return {
      revenueLines: rev.length,
      expenseLines: exp.length,
      totalRevenue: rev.reduce((s, r) => s + r.amount, 0),
      totalExpenses: exp.reduce((s, r) => s + r.amount, 0),
      net: rev.reduce((s, r) => s + r.amount, 0) - exp.reduce((s, r) => s + r.amount, 0),
      total: included.length,
    };
  }, [parsedRows]);

  async function confirmImport() {
    setImporting(true);

    try {
      if (replaceExisting && existingBatch) {
        await fetch(`/api/finance/import-batches/${existingBatch.id}`, { method: 'DELETE' });
      }

      const batchRes = await fetch('/api/finance/import-batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: selectedYear,
          month: selectedMonth,
          filename: fileName,
          total_revenue: summary.totalRevenue,
          total_expenses: summary.totalExpenses,
          line_count: summary.total,
        }),
      });
      const batchJson = await batchRes.json();

      if (batchJson.error || !batchJson.data) {
        alert(`Failed to create import batch: ${batchJson.error?.message}`);
        setImporting(false);
        return;
      }

      const batch = batchJson.data;
      const included = parsedRows.filter(r => r.included);
      const CHUNK = 50;
      for (let i = 0; i < included.length; i += CHUNK) {
        const chunk = included.slice(i, i + CHUNK).map(r => ({
          date: r.date,
          amount: r.amount,
          type: r.type,
          category: r.category,
          vendor: r.description || null,
          description: r.description || null,
          payment_method: 'other' as const,
          import_batch_id: batch.id,
        }));

        const expRes = await fetch('/api/finance/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(chunk),
        });
        const expJson = await expRes.json();
        if (expJson.error) {
          alert(`Import error on chunk ${Math.floor(i / CHUNK) + 1}: ${expJson.error.message}`);
          setImporting(false);
          return;
        }
      }

      handleClose();
      onImportComplete();
    } catch (err) {
      alert(`Unexpected error: ${err}`);
      setImporting(false);
    }
  }

  function formatCurrency(v: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
  }

  if (!isOpen) return null;

  return (
    <ModalOverlay className="pli-overlay" onClose={handleClose}>
      <div className="pli-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="pli-header">
          <div className="pli-header-left">
            <h2>Import P&L Statement</h2>
            <div className="pli-steps">
              <span className={`pli-step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}`}>1. Upload</span>
              <ChevronRight size={14} />
              <span className={`pli-step ${step >= 2 ? 'active' : ''} ${step > 2 ? 'done' : ''}`}>2. Map Columns</span>
              <ChevronRight size={14} />
              <span className={`pli-step ${step >= 3 ? 'active' : ''}`}>3. Review</span>
            </div>
          </div>
          <button className="pli-close" onClick={handleClose}><X size={20} /></button>
        </div>

        {/* Step 1: Upload */}
        {step === 1 && (
          <div className="pli-body">
            <div className="pli-month-row">
              <div className="pli-field">
                <label>Month</label>
                <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div className="pli-field">
                <label>Year</label>
                <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
                  {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            {existingBatch && (
              <div className="pli-warning">
                <AlertTriangle size={16} />
                <div>
                  <strong>{MONTHS[selectedMonth - 1]} {selectedYear}</strong> was already imported ({existingBatch.line_count} entries).
                  <label className="pli-replace-check">
                    <input type="checkbox" checked={replaceExisting} onChange={e => setReplaceExisting(e.target.checked)} />
                    Replace existing import
                  </label>
                </div>
              </div>
            )}

            <div
              className="pli-dropzone"
              onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag'); }}
              onDragLeave={e => e.currentTarget.classList.remove('drag')}
              onDrop={e => {
                e.preventDefault();
                e.currentTarget.classList.remove('drag');
                const file = e.dataTransfer.files[0];
                if (file) handleFile(file);
              }}
            >
              <Upload size={32} />
              <p>Drag & drop a CSV or Excel file here</p>
              <span>or</span>
              <label className="pli-browse-btn">
                Browse Files
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                    e.target.value = '';
                  }}
                />
              </label>
              <span className="pli-formats">Supports CSV, XLSX, XLS</span>
            </div>

            {existingBatch && !replaceExisting && (
              <p className="pli-hint">Check &quot;Replace existing import&quot; above to overwrite the previous import for this month.</p>
            )}
          </div>
        )}

        {/* Step 2: Column Mapping */}
        {step === 2 && (
          <div className="pli-body">
            <p className="pli-info">
              <FileText size={15} /> <strong>{fileName}</strong> — {rawData.length} data rows detected. Map each column below.
            </p>

            <div className="pli-preview-wrap">
              <table className="pli-preview-table">
                <thead>
                  <tr>
                    {headers.map((h, i) => (
                      <th key={i}>
                        <select
                          value={columnMap[i] || 'skip'}
                          onChange={e => setColumnMap({ ...columnMap, [i]: e.target.value as MappingField })}
                          className={`pli-map-select ${columnMap[i] && columnMap[i] !== 'skip' ? 'mapped' : ''}`}
                        >
                          <option value="skip">Skip</option>
                          <option value="date">Date</option>
                          <option value="description">Description</option>
                          <option value="amount">Amount</option>
                          <option value="type">Type</option>
                          <option value="debit">Debit</option>
                          <option value="credit">Credit</option>
                        </select>
                        <span className="pli-col-header">{h}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rawData.slice(0, 5).map((row, ri) => (
                    <tr key={ri}>
                      {(row as unknown[]).map((cell, ci) => (
                        <td key={ci}>{cell != null ? String(cell).substring(0, 30) : ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pli-actions">
              <button className="pli-btn-secondary" onClick={() => setStep(1)}>Back</button>
              <button className="pli-btn-primary" onClick={applyMapping}>
                Continue to Review
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div className="pli-body">
            <div className="pli-summary-bar">
              <div className="pli-summary-item rev">
                <span className="pli-sum-label">Revenue</span>
                <span className="pli-sum-value">{summary.revenueLines} lines — {formatCurrency(summary.totalRevenue)}</span>
              </div>
              <div className="pli-summary-item exp">
                <span className="pli-sum-label">Expenses</span>
                <span className="pli-sum-value">{summary.expenseLines} lines — {formatCurrency(summary.totalExpenses)}</span>
              </div>
              <div className={`pli-summary-item net ${summary.net >= 0 ? 'pos' : 'neg'}`}>
                <span className="pli-sum-label">Net</span>
                <span className="pli-sum-value">{formatCurrency(summary.net)}</span>
              </div>
            </div>

            <div className="pli-review-wrap">
              <table className="pli-review-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}></th>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Type</th>
                    <th>Category</th>
                    <th>Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((row, i) => (
                    <tr key={i} className={!row.included ? 'skipped' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={row.included}
                          onChange={e => {
                            const copy = [...parsedRows];
                            copy[i] = { ...copy[i], included: e.target.checked };
                            setParsedRows(copy);
                          }}
                        />
                      </td>
                      <td className="pli-cell-date">{row.date}</td>
                      <td className="pli-cell-desc">{row.description}</td>
                      <td>
                        <select
                          className={`pli-type-badge ${row.type}`}
                          value={row.type}
                          onChange={e => {
                            const copy = [...parsedRows];
                            copy[i] = { ...copy[i], type: e.target.value as 'revenue' | 'expense' };
                            setParsedRows(copy);
                          }}
                        >
                          <option value="revenue">Revenue</option>
                          <option value="expense">Expense</option>
                        </select>
                      </td>
                      <td>
                        {row.type === 'expense' ? (
                          <select
                            className="pli-cat-select"
                            value={row.category || 'other'}
                            onChange={e => {
                              const copy = [...parsedRows];
                              copy[i] = { ...copy[i], category: e.target.value as ExpenseCategory };
                              setParsedRows(copy);
                            }}
                          >
                            {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map(c => (
                              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                            ))}
                          </select>
                        ) : <span className="pli-cat-na">—</span>}
                      </td>
                      <td className={`pli-cell-amount ${row.type === 'revenue' ? 'green' : 'red'}`}>
                        {formatCurrency(row.amount)}
                      </td>
                      <td>
                        {row.duplicateOf && (
                          <span className="pli-dup-badge" title={`Possible duplicate of: ${row.duplicateOf}`}>
                            <AlertTriangle size={13} />
                            Duplicate
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pli-actions">
              <button className="pli-btn-secondary" onClick={() => setStep(2)}>Back</button>
              <button className="pli-btn-primary" onClick={confirmImport} disabled={importing || summary.total === 0}>
                {importing ? 'Importing...' : `Confirm Import (${summary.total} entries)`}
              </button>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .pli-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1.5rem; }
        .pli-modal { background: white; border-radius: 20px; width: 100%; max-width: 820px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px rgba(0,0,0,0.15); }

        .pli-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 1.25rem 1.5rem; border-bottom: 1px solid #e5e7eb; }
        .pli-header-left { display: flex; flex-direction: column; gap: 0.5rem; }
        .pli-header h2 { font-size: 1.125rem; font-weight: 700; color: #111827; margin: 0; }
        .pli-steps { display: flex; align-items: center; gap: 0.375rem; font-size: 0.75rem; color: #9ca3af; }
        .pli-step { padding: 0.2rem 0.5rem; border-radius: 4px; }
        .pli-step.active { color: #111827; font-weight: 600; }
        .pli-step.done { color: #10b981; }
        .pli-close { display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 9px; border: none; background: #f3f4f6; color: #6b7280; cursor: pointer; }
        .pli-close:hover { background: #e5e7eb; }

        .pli-body { padding: 1.25rem 1.5rem; overflow-y: auto; flex: 1; }

        /* Step 1 */
        .pli-month-row { display: flex; gap: 1rem; margin-bottom: 1rem; }
        .pli-field { display: flex; flex-direction: column; gap: 0.375rem; flex: 1; }
        .pli-field label { font-size: 0.8125rem; font-weight: 500; color: #374151; }
        .pli-field select { padding: 0.625rem; border: 1px solid #e5e7eb; border-radius: 9px; font-size: 0.8125rem; color: #374151; }
        .pli-field select:focus { outline: none; border-color: #10b981; box-shadow: 0 0 0 3px rgba(16,185,129,0.1); }

        .pli-warning { display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.875rem 1rem; background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; margin-bottom: 1rem; font-size: 0.8125rem; color: #92400e; }
        .pli-warning svg { flex-shrink: 0; margin-top: 2px; }
        .pli-replace-check { display: flex; align-items: center; gap: 0.375rem; margin-top: 0.5rem; font-weight: 500; cursor: pointer; }
        .pli-replace-check input { accent-color: #f59e0b; }

        .pli-dropzone { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.75rem; padding: 2.5rem 2rem; border: 2px dashed #d1d5db; border-radius: 14px; text-align: center; color: #6b7280; transition: all 0.2s; }
        .pli-dropzone.drag { border-color: #10b981; background: #f0fdf4; }
        .pli-dropzone svg { color: #9ca3af; }
        .pli-dropzone p { margin: 0; font-size: 0.9375rem; font-weight: 500; color: #374151; }
        .pli-dropzone span { font-size: 0.75rem; color: #9ca3af; }
        .pli-browse-btn { display: inline-flex; padding: 0.5rem 1.25rem; background: #10b981; color: white; border-radius: 8px; font-size: 0.8125rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .pli-browse-btn:hover { background: #059669; }
        .pli-formats { font-size: 0.6875rem; color: #9ca3af; }
        .pli-hint { font-size: 0.75rem; color: #9ca3af; margin-top: 0.75rem; text-align: center; }

        /* Step 2 */
        .pli-info { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8125rem; color: #374151; margin: 0 0 1rem 0; }
        .pli-preview-wrap { overflow-x: auto; border: 1px solid #e5e7eb; border-radius: 10px; margin-bottom: 1rem; }
        .pli-preview-table { width: 100%; border-collapse: collapse; font-size: 0.75rem; }
        .pli-preview-table th { padding: 0.5rem 0.625rem; background: #f9fafb; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
        .pli-preview-table td { padding: 0.4rem 0.625rem; border-bottom: 1px solid #f3f4f6; color: #374151; white-space: nowrap; max-width: 180px; overflow: hidden; text-overflow: ellipsis; }
        .pli-map-select { display: block; width: 100%; padding: 0.3rem 0.375rem; border: 1px solid #e5e7eb; border-radius: 5px; font-size: 0.6875rem; margin-bottom: 0.375rem; color: #6b7280; }
        .pli-map-select.mapped { border-color: #10b981; color: #059669; background: #f0fdf4; font-weight: 500; }
        .pli-col-header { font-size: 0.6875rem; color: #9ca3af; font-weight: 400; display: block; }

        /* Step 3 */
        .pli-summary-bar { display: flex; gap: 1rem; margin-bottom: 1rem; }
        .pli-summary-item { flex: 1; padding: 0.75rem 1rem; border-radius: 10px; border: 1px solid #e5e7eb; }
        .pli-summary-item.rev { border-color: #a7f3d0; background: #ecfdf5; }
        .pli-summary-item.exp { border-color: #fecaca; background: #fef2f2; }
        .pli-summary-item.net.pos { border-color: #a7f3d0; background: #ecfdf5; }
        .pli-summary-item.net.neg { border-color: #fecaca; background: #fef2f2; }
        .pli-sum-label { display: block; font-size: 0.6875rem; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
        .pli-sum-value { font-size: 0.875rem; font-weight: 600; color: #111827; }

        .pli-review-wrap { overflow-x: auto; border: 1px solid #e5e7eb; border-radius: 10px; margin-bottom: 1rem; max-height: 360px; overflow-y: auto; }
        .pli-review-table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
        .pli-review-table th { text-align: left; padding: 0.625rem 0.75rem; font-size: 0.6875rem; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e5e7eb; background: #f9fafb; position: sticky; top: 0; z-index: 1; }
        .pli-review-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #f3f4f6; color: #374151; }
        .pli-review-table tr.skipped td { opacity: 0.4; }
        .pli-review-table input[type="checkbox"] { accent-color: #10b981; }

        .pli-cell-date { white-space: nowrap; color: #6b7280; font-size: 0.75rem; }
        .pli-cell-desc { max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .pli-cell-amount { font-weight: 600; white-space: nowrap; }
        .pli-cell-amount.green { color: #10b981; }
        .pli-cell-amount.red { color: #ef4444; }

        .pli-type-badge { padding: 0.2rem 0.5rem; border-radius: 5px; font-size: 0.6875rem; font-weight: 500; border: 1px solid #e5e7eb; cursor: pointer; }
        .pli-type-badge.revenue { background: #ecfdf5; color: #059669; border-color: #a7f3d0; }
        .pli-type-badge.expense { background: #fef2f2; color: #dc2626; border-color: #fecaca; }

        .pli-cat-select { padding: 0.2rem 0.375rem; border: 1px solid #e5e7eb; border-radius: 5px; font-size: 0.6875rem; color: #374151; }
        .pli-cat-na { color: #d1d5db; }

        .pli-dup-badge { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.2rem 0.5rem; background: #fffbeb; border: 1px solid #fde68a; border-radius: 5px; font-size: 0.6875rem; font-weight: 500; color: #92400e; white-space: nowrap; }

        /* Actions */
        .pli-actions { display: flex; justify-content: flex-end; gap: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #f3f4f6; }
        .pli-btn-secondary { padding: 0.625rem 1.125rem; background: white; border: 1px solid #e5e7eb; border-radius: 9px; font-weight: 500; font-size: 0.8125rem; color: #374151; cursor: pointer; }
        .pli-btn-secondary:hover { background: #f9fafb; }
        .pli-btn-primary { display: flex; align-items: center; gap: 0.375rem; padding: 0.625rem 1.25rem; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border: none; border-radius: 9px; font-weight: 600; font-size: 0.8125rem; color: white; cursor: pointer; transition: all 0.2s; }
        .pli-btn-primary:hover { box-shadow: 0 4px 12px rgba(16,185,129,0.3); }
        .pli-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }

        @media (max-width: 768px) {
          .pli-modal { max-width: 100%; }
          .pli-month-row { flex-direction: column; }
          .pli-summary-bar { flex-direction: column; }
          .pli-review-table { min-width: 600px; }
        }
      `}</style>
    </ModalOverlay>
  );
}
