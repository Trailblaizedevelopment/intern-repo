'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  DollarSign,
  TrendingDown,
  TrendingUp,
  Plus,
  X,
  Trash2,
  Edit2,
  Calendar,
  Download,
  Upload,
  ChevronRight,
  FileText,
  PieChart,
  Briefcase,
  AlertTriangle,
  Search,
  Filter,
  ChevronDown,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Expense, MonthlyStatement, ImportBatch, ExpenseCategory, ExpensePaymentMethod } from '@/lib/supabase';
import ConfirmModal from '@/components/ConfirmModal';
import PLImportModal from './PLImportModal';
import ModalOverlay from '@/components/ModalOverlay';

interface Payment {
  id: string;
  chapter_id: string;
  amount: number;
  payment_date: string;
  payment_method: 'card' | 'bank_transfer' | 'check' | 'cash' | 'other';
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  reference_number?: string;
  notes?: string;
  chapter?: {
    id: string;
    chapter_name: string;
    school?: string;
  };
}

interface AccountingTabProps {
  payments: Payment[];
}

interface MonthData {
  key: string;
  year: number;
  month: number;
  label: string;
  revenue: number;
  expenses: number;
  net: number;
  revenueItems: Payment[];
  expenseItems: Expense[];
  statement: MonthlyStatement | null;
}

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  software: 'Software',
  travel: 'Travel',
  legal: 'Legal',
  marketing: 'Marketing',
  payroll: 'Payroll',
  office: 'Office',
  other: 'Other',
};

const CATEGORY_COLORS: Record<ExpenseCategory, { bg: string; text: string }> = {
  software: { bg: '#eff6ff', text: '#3b82f6' },
  travel: { bg: '#faf5ff', text: '#8b5cf6' },
  legal: { bg: '#fefce8', text: '#ca8a04' },
  marketing: { bg: '#fdf2f8', text: '#ec4899' },
  payroll: { bg: '#ecfdf5', text: '#10b981' },
  office: { bg: '#f1f5f9', text: '#64748b' },
  other: { bg: '#f3f4f6', text: '#6b7280' },
};

const METHOD_LABELS: Record<ExpensePaymentMethod, string> = {
  brex: 'Brex',
  personal: 'Personal',
  wire: 'Wire',
  other: 'Other',
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function AccountingTab({ payments }: AccountingTabProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [statements, setStatements] = useState<MonthlyStatement[]>([]);
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: string | null }>({ show: false, id: null });
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState<{ show: boolean; batch: ImportBatch | null }>({ show: false, batch: null });
  const [uploadingMonth, setUploadingMonth] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [expenseSearch, setExpenseSearch] = useState('');

  const [expenseForm, setExpenseForm] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    category: 'software' as ExpenseCategory,
    vendor: '',
    description: '',
    payment_method: 'brex' as ExpensePaymentMethod,
    receipt_url: '',
  });

  useEffect(() => {
    fetchAccountingData();
  }, []);

  async function fetchAccountingData() {
    setLoading(true);
    await Promise.all([fetchExpenses(), fetchStatements(), fetchBatches()]);
    setLoading(false);
  }

  async function fetchExpenses() {
    try {
      const res = await fetch('/api/finance/expenses');
      const json = await res.json();
      if (!json.error) setExpenses(json.data || []);
    } catch (err) {
      console.error('Error fetching expenses:', err);
    }
  }

  async function fetchStatements() {
    try {
      const res = await fetch('/api/finance/statements');
      const json = await res.json();
      if (!json.error) setStatements(json.data || []);
    } catch (err) {
      console.error('Error fetching statements:', err);
    }
  }

  async function fetchBatches() {
    try {
      const res = await fetch('/api/finance/import-batches');
      const json = await res.json();
      if (!json.error) setImportBatches(json.data || []);
    } catch (err) {
      console.error('Error fetching import batches:', err);
    }
  }

  async function deleteBatch(batch: ImportBatch) {
    try {
      // Delete expenses first, then the batch
      await fetch(`/api/finance/import-batches/${batch.id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Error deleting batch:', err);
    }
    setBatchDeleteConfirm({ show: false, batch: null });
    fetchAccountingData();
  }

  function downloadTemplate() {
    const csv = `Date,Description,Category,Amount,Type\n2026-01-15,Vercel Pro,Software,-49.00,Expense\n2026-01-15,Chapter Payment,Revenue,299.00,Revenue\n2026-01-20,Delta Airlines,Travel,-385.00,Expense\n2026-01-25,Contractor Invoice,Payroll,-1500.00,Expense`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pl-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function saveExpense() {
    if (!expenseForm.amount) {
      alert('Amount is required');
      return;
    }

    const payload = {
      date: expenseForm.date,
      amount: parseFloat(expenseForm.amount),
      category: expenseForm.category,
      vendor: expenseForm.vendor || null,
      description: expenseForm.description || null,
      payment_method: expenseForm.payment_method,
      receipt_url: expenseForm.receipt_url || null,
    };

    try {
      if (editingExpense) {
        const res = await fetch(`/api/finance/expenses/${editingExpense.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (json.error) {
          alert(`Failed to update expense: ${json.error.message}`);
          return;
        }
      } else {
        const res = await fetch('/api/finance/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (json.error) {
          alert(`Failed to log expense: ${json.error.message}`);
          return;
        }
      }
    } catch (err) {
      console.error('Error saving expense:', err);
      alert('Failed to save expense');
      return;
    }

    resetExpenseForm();
    fetchExpenses();
  }

  async function deleteExpense(id: string) {
    try {
      const res = await fetch(`/api/finance/expenses/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.error) alert(`Failed to delete expense: ${json.error.message}`);
      else fetchExpenses();
    } catch (err) {
      console.error('Error deleting expense:', err);
      alert('Failed to delete expense');
    }
    setDeleteConfirm({ show: false, id: null });
  }

  function resetExpenseForm() {
    setExpenseForm({
      date: new Date().toISOString().split('T')[0],
      amount: '',
      category: 'software',
      vendor: '',
      description: '',
      payment_method: 'brex',
      receipt_url: '',
    });
    setEditingExpense(null);
    setShowExpenseModal(false);
  }

  function openEditExpense(expense: Expense) {
    setEditingExpense(expense);
    setExpenseForm({
      date: expense.date,
      amount: expense.amount.toString(),
      category: expense.category || 'other',
      vendor: expense.vendor || '',
      description: expense.description || '',
      payment_method: expense.payment_method,
      receipt_url: expense.receipt_url || '',
    });
    setShowExpenseModal(true);
  }

  async function uploadStatementAttachment(year: number, month: number, file: File) {
    const monthKey = `${year}-${month}`;
    setUploadingMonth(monthKey);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'statements');

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const result = await res.json();

      if (result.error) {
        alert(`Upload failed: ${result.error.message}`);
        return;
      }

      await fetch('/api/finance/statements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, attachment_url: result.data.url, attachment_name: file.name }),
      });

      fetchStatements();
    } catch {
      alert('Upload failed unexpectedly');
    } finally {
      setUploadingMonth(null);
    }
  }

  const completedPayments = useMemo(
    () => payments.filter(p => p.status === 'completed'),
    [payments]
  );

  const revenueEntries = useMemo(
    () => expenses.filter(e => e.type === 'revenue'),
    [expenses]
  );

  const expenseEntries = useMemo(
    () => expenses.filter(e => !e.type || e.type === 'expense'),
    [expenses]
  );

  const totalRevenue = useMemo(
    () => completedPayments.reduce((s, p) => s + p.amount, 0) + revenueEntries.reduce((s, e) => s + e.amount, 0),
    [completedPayments, revenueEntries]
  );

  const totalExpenses = useMemo(
    () => expenseEntries.reduce((s, e) => s + e.amount, 0),
    [expenseEntries]
  );

  const netCash = totalRevenue - totalExpenses;

  const burnAndRunway = useMemo(() => {
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const recentExpenses = expenseEntries.filter(e => new Date(e.date) >= threeMonthsAgo);
    const monthSpan = Math.max(1, 3);
    const monthlyBurn = recentExpenses.reduce((s, e) => s + e.amount, 0) / monthSpan;
    const runway = monthlyBurn > 0 ? Math.floor(netCash / monthlyBurn) : null;
    return { monthlyBurn, runway };
  }, [expenseEntries, netCash]);

  // Monthly data for chart + statements list
  const monthlyData = useMemo(() => {
    const map = new Map<string, MonthData>();

    function getOrCreate(year: number, month: number): MonthData {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          year,
          month,
          label: `${MONTH_NAMES[month - 1]} ${year}`,
          revenue: 0,
          expenses: 0,
          net: 0,
          revenueItems: [],
          expenseItems: [],
          statement: null,
        });
      }
      return map.get(key)!;
    }

    for (const p of completedPayments) {
      const d = new Date(p.payment_date);
      const md = getOrCreate(d.getFullYear(), d.getMonth() + 1);
      md.revenue += p.amount;
      md.revenueItems.push(p);
    }

    for (const e of revenueEntries) {
      const d = new Date(e.date);
      const md = getOrCreate(d.getFullYear(), d.getMonth() + 1);
      md.revenue += e.amount;
    }

    for (const e of expenseEntries) {
      const d = new Date(e.date);
      const md = getOrCreate(d.getFullYear(), d.getMonth() + 1);
      md.expenses += e.amount;
      md.expenseItems.push(e);
    }

    for (const s of statements) {
      const md = getOrCreate(s.year, s.month);
      md.statement = s;
    }

    // Compute net
    for (const md of map.values()) {
      md.net = md.revenue - md.expenses;
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
  }, [completedPayments, revenueEntries, expenseEntries, statements]);

  // Chart data: last 12 months, ascending order
  const chartData = useMemo(() => {
    const now = new Date();
    const months: { name: string; revenue: number; expenses: number }[] = [];

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const key = `${y}-${String(m).padStart(2, '0')}`;
      const found = monthlyData.find(md => md.key === key);
      months.push({
        name: `${MONTH_NAMES[m - 1].substring(0, 3)} ${y !== now.getFullYear() ? y : ''}`.trim(),
        revenue: found ? found.revenue : 0,
        expenses: found ? found.expenses : 0,
      });
    }

    return months;
  }, [monthlyData]);

  const filteredExpenses = useMemo(() => {
    return expenseEntries.filter(e => {
      const matchCat = categoryFilter === 'all' || e.category === categoryFilter;
      const search = expenseSearch.toLowerCase();
      const matchSearch = !expenseSearch ||
        e.vendor?.toLowerCase().includes(search) ||
        e.description?.toLowerCase().includes(search);
      return matchCat && matchSearch;
    });
  }, [expenseEntries, categoryFilter, expenseSearch]);

  function formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function exportCSV() {
    const rows = [['Month', 'Revenue', 'Expenses', 'Net']];
    for (const md of monthlyData) {
      rows.push([md.label, md.revenue.toFixed(2), md.expenses.toFixed(2), md.net.toFixed(2)]);
    }
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trailblaize-financials-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="acct-loading">
        <RefreshCw size={24} className="spin" />
        <span>Loading accounting data...</span>
        <style jsx>{`
          .acct-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4rem 2rem; color: #6b7280; gap: 0.75rem; }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          .spin { animation: spin 1s linear infinite; }
        `}</style>
      </div>
    );
  }

  return (
    <div className="acct-tab">
      {/* Summary Metrics */}
      <div className="acct-metrics">
        <div className="acct-metric-card revenue">
          <div className="acct-metric-icon revenue-icon">
            <TrendingUp size={22} />
          </div>
          <div className="acct-metric-content">
            <span className="acct-metric-label">Total Revenue</span>
            <span className="acct-metric-value">{formatCurrency(totalRevenue)}</span>
            <span className="acct-metric-sub">{completedPayments.length + revenueEntries.length} entries</span>
          </div>
        </div>

        <div className="acct-metric-card expense">
          <div className="acct-metric-icon expense-icon">
            <TrendingDown size={22} />
          </div>
          <div className="acct-metric-content">
            <span className="acct-metric-label">Total Expenses</span>
            <span className="acct-metric-value">{formatCurrency(totalExpenses)}</span>
            <span className="acct-metric-sub">{expenseEntries.length} entries</span>
          </div>
        </div>

        <div className={`acct-metric-card ${netCash >= 0 ? 'positive' : 'negative'}`}>
          <div className={`acct-metric-icon ${netCash >= 0 ? 'positive-icon' : 'negative-icon'}`}>
            <DollarSign size={22} />
          </div>
          <div className="acct-metric-content">
            <span className="acct-metric-label">Net Cash Position</span>
            <span className="acct-metric-value">{formatCurrency(netCash)}</span>
            <span className="acct-metric-sub">{netCash >= 0 ? 'Positive' : 'Deficit'}</span>
          </div>
        </div>

        <div className="acct-metric-card burn">
          <div className="acct-metric-icon burn-icon">
            <Briefcase size={22} />
          </div>
          <div className="acct-metric-content">
            <span className="acct-metric-label">Burn & Runway</span>
            <span className="acct-metric-value">{formatCurrency(burnAndRunway.monthlyBurn)}<span className="acct-burn-per">/mo</span></span>
            <span className="acct-metric-sub">
              {burnAndRunway.runway !== null ? `~${burnAndRunway.runway} months runway` : 'No burn'}
            </span>
          </div>
        </div>
      </div>

      {/* Revenue vs Expenses Chart */}
      <div className="acct-chart-section">
        <div className="acct-section-header">
          <div className="acct-section-title">
            <PieChart size={18} />
            <h3>Revenue vs Expenses</h3>
          </div>
          <div className="acct-header-actions">
            <button className="acct-template-btn" onClick={downloadTemplate}>
              <Download size={14} />
              Template
            </button>
            <button className="acct-import-btn" onClick={() => setShowImportModal(true)}>
              <Upload size={16} />
              Import P&L
            </button>
            <button className="acct-export-btn" onClick={exportCSV}>
              <Download size={16} />
              Export CSV
            </button>
          </div>
        </div>
        <div className="acct-chart-container">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#9ca3af' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
              <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
              <Tooltip
                contentStyle={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '0.8125rem' }}
                formatter={(value) => [formatCurrency(value as number)]}
              />
              <Legend wrapperStyle={{ fontSize: '0.8125rem' }} />
              <Bar dataKey="revenue" name="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Statements */}
      <div className="acct-section">
        <div className="acct-section-header">
          <div className="acct-section-title">
            <FileText size={18} />
            <h3>Monthly Statements</h3>
          </div>
        </div>
        {monthlyData.length === 0 ? (
          <div className="acct-empty">
            <FileText size={40} />
            <p>No financial data yet</p>
            <span>Record payments and log expenses to see monthly statements</span>
          </div>
        ) : (
          <div className="acct-statements-list">
            {monthlyData.map((md) => {
              const isExpanded = expandedMonth === md.key;
              const isUploading = uploadingMonth === md.key;
              const monthBatch = importBatches.find(b => b.year === md.year && b.month === md.month);
              return (
                <div key={md.key} className={`acct-statement-card ${isExpanded ? 'expanded' : ''}`}>
                  <div className="acct-statement-header" onClick={() => setExpandedMonth(isExpanded ? null : md.key)}>
                    <div className="acct-statement-left">
                      <ChevronRight size={18} className={`acct-chevron ${isExpanded ? 'rotated' : ''}`} />
                      <div className="acct-statement-title">
                        <h4>{md.label}</h4>
                        {md.statement?.attachment_name && (
                          <span className="acct-attachment-badge">
                            <FileText size={12} />
                            {md.statement.attachment_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="acct-statement-summary">
                      <div className="acct-stat-item in">
                        <span className="acct-stat-label">In</span>
                        <span className="acct-stat-value">{formatCurrency(md.revenue)}</span>
                      </div>
                      <div className="acct-stat-item out">
                        <span className="acct-stat-label">Out</span>
                        <span className="acct-stat-value">{formatCurrency(md.expenses)}</span>
                      </div>
                      <div className={`acct-stat-item net ${md.net >= 0 ? 'positive' : 'negative'}`}>
                        <span className="acct-stat-label">Net</span>
                        <span className="acct-stat-value">{formatCurrency(md.net)}</span>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="acct-statement-body">
                      <div className="acct-statement-actions">
                        <label className={`acct-upload-btn ${isUploading ? 'uploading' : ''}`}>
                          {isUploading ? <RefreshCw size={14} className="spin" /> : <Upload size={14} />}
                          {isUploading ? 'Uploading...' : 'Attach Document'}
                          <input
                            type="file"
                            accept=".pdf,.xlsx,.xls,.csv,.doc,.docx"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) uploadStatementAttachment(md.year, md.month, file);
                              e.target.value = '';
                            }}
                            disabled={isUploading}
                          />
                        </label>
                        {md.statement?.attachment_url && (
                          <a href={md.statement.attachment_url} target="_blank" rel="noopener noreferrer" className="acct-download-btn">
                            <ExternalLink size={14} />
                            View Document
                          </a>
                        )}
                      </div>

                      {monthBatch && (
                        <div className="acct-batch-info">
                          <div className="acct-batch-left">
                            <FileText size={14} />
                            <span>Imported from <strong>{monthBatch.filename}</strong> — {monthBatch.line_count} entries ({formatCurrency(monthBatch.total_revenue)} revenue, {formatCurrency(monthBatch.total_expenses)} expenses)</span>
                          </div>
                          <button
                            className="acct-batch-delete"
                            onClick={() => setBatchDeleteConfirm({ show: true, batch: monthBatch })}
                          >
                            <Trash2 size={13} />
                            Delete Import
                          </button>
                        </div>
                      )}

                      {md.revenueItems.length > 0 && (
                        <div className="acct-line-items">
                          <h5>Revenue ({md.revenueItems.length})</h5>
                          <table className="acct-line-table">
                            <thead><tr><th>Date</th><th>Chapter</th><th>Amount</th></tr></thead>
                            <tbody>
                              {md.revenueItems.map(p => (
                                <tr key={p.id}>
                                  <td>{formatDate(p.payment_date)}</td>
                                  <td>{p.chapter?.chapter_name || 'Unknown'}</td>
                                  <td className="acct-amount-cell green">{formatCurrency(p.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {md.expenseItems.length > 0 && (
                        <div className="acct-line-items">
                          <h5>Expenses ({md.expenseItems.length})</h5>
                          <table className="acct-line-table">
                            <thead><tr><th>Date</th><th>Vendor</th><th>Category</th><th>Amount</th></tr></thead>
                            <tbody>
                              {md.expenseItems.map(e => (
                                <tr key={e.id}>
                                  <td>{formatDate(e.date)}</td>
                                  <td>{e.vendor || e.description || '—'}</td>
                                  <td><span className="acct-cat-badge" style={{ background: CATEGORY_COLORS[e.category || 'other']?.bg, color: CATEGORY_COLORS[e.category || 'other']?.text }}>{CATEGORY_LABELS[e.category || 'other']}</span></td>
                                  <td className="acct-amount-cell red">{formatCurrency(e.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
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

      {/* Expense Log */}
      <div className="acct-section">
        <div className="acct-section-header">
          <div className="acct-section-title">
            <AlertTriangle size={18} />
            <h3>Expense Log</h3>
          </div>
          <button className="acct-add-expense-btn" onClick={() => setShowExpenseModal(true)}>
            <Plus size={16} />
            Log Expense
          </button>
        </div>

        <div className="acct-expense-filters">
          <div className="acct-expense-search">
            <Search size={16} />
            <input
              placeholder="Search vendor or description..."
              value={expenseSearch}
              onChange={(e) => setExpenseSearch(e.target.value)}
            />
            {expenseSearch && (
              <button onClick={() => setExpenseSearch('')} className="acct-search-clear"><X size={14} /></button>
            )}
          </div>
          <div className="acct-expense-filter">
            <Filter size={14} />
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="all">All Categories</option>
              {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map(cat => (
                <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
              ))}
            </select>
            <ChevronDown size={14} />
          </div>
        </div>

        {filteredExpenses.length === 0 ? (
          <div className="acct-empty small">
            <DollarSign size={32} />
            <p>{expenses.length === 0 ? 'No expenses logged yet' : 'No expenses match your filters'}</p>
            {expenses.length === 0 && (
              <button className="acct-add-expense-btn" onClick={() => setShowExpenseModal(true)}>
                <Plus size={16} />
                Log Your First Expense
              </button>
            )}
          </div>
        ) : (
          <div className="acct-expense-table-wrap">
            <table className="acct-expense-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Vendor / Description</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Receipt</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map(expense => (
                  <tr key={expense.id}>
                    <td className="acct-exp-date">
                      <Calendar size={13} />
                      {formatDate(expense.date)}
                    </td>
                    <td>
                      <div className="acct-exp-vendor">
                        <span className="acct-exp-vendor-name">{expense.vendor || '—'}</span>
                        {expense.description && <span className="acct-exp-desc">{expense.description}</span>}
                      </div>
                    </td>
                    <td>
                      <span className="acct-cat-badge" style={{ background: CATEGORY_COLORS[expense.category || 'other']?.bg, color: CATEGORY_COLORS[expense.category || 'other']?.text }}>
                        {CATEGORY_LABELS[expense.category || 'other']}
                      </span>
                    </td>
                    <td className="acct-amount-cell red">{formatCurrency(expense.amount)}</td>
                    <td className="acct-exp-method">{METHOD_LABELS[expense.payment_method]}</td>
                    <td>
                      {expense.receipt_url ? (
                        <a href={expense.receipt_url} target="_blank" rel="noopener noreferrer" className="acct-receipt-link">
                          <ExternalLink size={13} /> View
                        </a>
                      ) : '—'}
                    </td>
                    <td className="acct-exp-actions">
                      <button className="acct-action-btn" onClick={() => openEditExpense(expense)} title="Edit"><Edit2 size={15} /></button>
                      <button className="acct-action-btn delete" onClick={() => setDeleteConfirm({ show: true, id: expense.id })} title="Delete"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Expense Modal */}
      {showExpenseModal && (
        <ModalOverlay className="acct-modal-overlay" onClose={() => resetExpenseForm()}>
          <div className="acct-modal" onClick={(e) => e.stopPropagation()}>
            <div className="acct-modal-header">
              <h2>{editingExpense ? 'Edit Expense' : 'Log Expense'}</h2>
              <button className="acct-modal-close" onClick={resetExpenseForm}><X size={20} /></button>
            </div>
            <div className="acct-modal-body">
              <div className="acct-form-row">
                <div className="acct-form-group">
                  <label>Date</label>
                  <input type="date" value={expenseForm.date} onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })} />
                </div>
                <div className="acct-form-group">
                  <label>Amount *</label>
                  <div className="acct-input-icon">
                    <DollarSign size={15} />
                    <input type="number" step="0.01" min="0" placeholder="0.00" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="acct-form-row">
                <div className="acct-form-group">
                  <label>Category</label>
                  <select value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value as ExpenseCategory })}>
                    {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map(cat => (
                      <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                    ))}
                  </select>
                </div>
                <div className="acct-form-group">
                  <label>Payment Method</label>
                  <select value={expenseForm.payment_method} onChange={(e) => setExpenseForm({ ...expenseForm, payment_method: e.target.value as ExpensePaymentMethod })}>
                    {(Object.keys(METHOD_LABELS) as ExpensePaymentMethod[]).map(m => (
                      <option key={m} value={m}>{METHOD_LABELS[m]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="acct-form-row">
                <div className="acct-form-group full">
                  <label>Vendor</label>
                  <input type="text" placeholder="e.g. AWS, Vercel, Delta Airlines..." value={expenseForm.vendor} onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })} />
                </div>
              </div>
              <div className="acct-form-row">
                <div className="acct-form-group full">
                  <label>Description</label>
                  <textarea placeholder="What was this expense for..." rows={2} value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} />
                </div>
              </div>
              <div className="acct-form-row">
                <div className="acct-form-group full">
                  <label>Receipt URL (optional)</label>
                  <input type="url" placeholder="https://..." value={expenseForm.receipt_url} onChange={(e) => setExpenseForm({ ...expenseForm, receipt_url: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="acct-modal-footer">
              <button className="acct-btn-secondary" onClick={resetExpenseForm}>Cancel</button>
              <button className="acct-btn-primary" onClick={saveExpense}>
                {editingExpense ? 'Update Expense' : 'Log Expense'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Delete Confirm */}
      <ConfirmModal
        isOpen={deleteConfirm.show}
        title="Delete Expense"
        message="Are you sure you want to delete this expense? This action cannot be undone."
        confirmText="Delete"
        onConfirm={() => deleteConfirm.id && deleteExpense(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm({ show: false, id: null })}
      />

      <ConfirmModal
        isOpen={batchDeleteConfirm.show}
        title="Delete Import"
        message={`Are you sure you want to delete this import? All ${batchDeleteConfirm.batch?.line_count || 0} entries from "${batchDeleteConfirm.batch?.filename || ''}" will be removed.`}
        confirmText="Delete Import"
        onConfirm={() => batchDeleteConfirm.batch && deleteBatch(batchDeleteConfirm.batch)}
        onCancel={() => setBatchDeleteConfirm({ show: false, batch: null })}
      />

      <PLImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={() => {
          fetchAccountingData();
          setShowImportModal(false);
        }}
        existingPayments={payments}
        existingBatches={importBatches}
      />

      <style jsx>{`
        .acct-tab {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        /* Metrics */
        .acct-metrics {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
        }

        .acct-metric-card {
          background: white;
          border-radius: 14px;
          padding: 1.25rem;
          border: 1px solid #e5e7eb;
          display: flex;
          align-items: flex-start;
          gap: 1rem;
        }

        .acct-metric-card.revenue { border-left: 3px solid #10b981; }
        .acct-metric-card.expense { border-left: 3px solid #ef4444; }
        .acct-metric-card.positive { border-left: 3px solid #10b981; }
        .acct-metric-card.negative { border-left: 3px solid #ef4444; }
        .acct-metric-card.burn { border-left: 3px solid #f59e0b; }

        .acct-metric-icon {
          width: 44px;
          height: 44px;
          border-radius: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .revenue-icon { background: #ecfdf5; color: #10b981; }
        .expense-icon { background: #fef2f2; color: #ef4444; }
        .positive-icon { background: #ecfdf5; color: #10b981; }
        .negative-icon { background: #fef2f2; color: #ef4444; }
        .burn-icon { background: #fffbeb; color: #f59e0b; }

        .acct-metric-content { display: flex; flex-direction: column; gap: 0.2rem; }
        .acct-metric-label { font-size: 0.7rem; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
        .acct-metric-value { font-size: 1.4rem; font-weight: 700; color: #111827; }
        .acct-metric-sub { font-size: 0.75rem; color: #9ca3af; }
        .acct-burn-per { font-size: 0.8rem; font-weight: 500; color: #9ca3af; margin-left: 2px; }

        /* Chart */
        .acct-chart-section {
          background: white;
          border-radius: 16px;
          border: 1px solid #e5e7eb;
          overflow: hidden;
        }

        .acct-chart-container { padding: 1rem 1rem 0.5rem; }

        /* Section Shared */
        .acct-section {
          background: white;
          border-radius: 16px;
          border: 1px solid #e5e7eb;
          overflow: hidden;
        }

        .acct-section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.25rem;
          border-bottom: 1px solid #e5e7eb;
          background: #f9fafb;
        }

        .acct-section-title {
          display: flex;
          align-items: center;
          gap: 0.625rem;
          color: #374151;
        }

        .acct-section-title h3 { font-size: 0.9375rem; font-weight: 600; margin: 0; }

        .acct-export-btn {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.5rem 0.875rem;
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          font-size: 0.8125rem;
          font-weight: 500;
          color: #374151;
          cursor: pointer;
          transition: all 0.2s;
        }

        .acct-export-btn:hover { background: #f3f4f6; border-color: #d1d5db; }

        .acct-header-actions { display: flex; align-items: center; gap: 0.5rem; }

        .acct-import-btn {
          display: flex; align-items: center; gap: 0.375rem;
          padding: 0.5rem 0.875rem; background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          border: none; border-radius: 8px; font-size: 0.8125rem; font-weight: 600;
          color: white; cursor: pointer; transition: all 0.2s;
        }
        .acct-import-btn:hover { box-shadow: 0 2px 8px rgba(16,185,129,0.3); transform: translateY(-1px); }

        .acct-template-btn {
          display: flex; align-items: center; gap: 0.25rem;
          padding: 0.4rem 0.75rem; background: white; border: 1px solid #e5e7eb;
          border-radius: 8px; font-size: 0.75rem; font-weight: 500;
          color: #6b7280; cursor: pointer; transition: all 0.2s;
        }
        .acct-template-btn:hover { background: #f3f4f6; border-color: #d1d5db; }

        .acct-batch-info {
          display: flex; align-items: center; justify-content: space-between;
          padding: 0.625rem 0.875rem; background: #eff6ff; border: 1px solid #bfdbfe;
          border-radius: 8px; margin-bottom: 0.75rem; font-size: 0.8125rem; color: #1e40af;
        }
        .acct-batch-left { display: flex; align-items: center; gap: 0.5rem; }
        .acct-batch-left strong { font-weight: 600; }
        .acct-batch-delete {
          display: flex; align-items: center; gap: 0.25rem;
          padding: 0.3rem 0.625rem; background: white; border: 1px solid #fecaca;
          border-radius: 6px; font-size: 0.75rem; font-weight: 500;
          color: #dc2626; cursor: pointer; transition: all 0.2s;
        }
        .acct-batch-delete:hover { background: #fef2f2; border-color: #f87171; }

        /* Statements List */
        .acct-statements-list { display: flex; flex-direction: column; }

        .acct-statement-card {
          border-bottom: 1px solid #f3f4f6;
        }

        .acct-statement-card:last-child { border-bottom: none; }

        .acct-statement-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.25rem;
          cursor: pointer;
          transition: background 0.15s;
        }

        .acct-statement-header:hover { background: #f9fafb; }

        .acct-statement-left { display: flex; align-items: center; gap: 0.75rem; }

        .acct-chevron { color: #9ca3af; transition: transform 0.2s; flex-shrink: 0; }
        .acct-chevron.rotated { transform: rotate(90deg); color: #10b981; }

        .acct-statement-title h4 { margin: 0; font-size: 0.9375rem; font-weight: 600; color: #111827; }

        .acct-attachment-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.6875rem;
          color: #6b7280;
          background: #f3f4f6;
          padding: 0.125rem 0.5rem;
          border-radius: 4px;
          margin-top: 0.25rem;
        }

        .acct-statement-summary { display: flex; gap: 1.5rem; }

        .acct-stat-item { display: flex; flex-direction: column; align-items: flex-end; min-width: 80px; }
        .acct-stat-label { font-size: 0.6875rem; font-weight: 500; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; }
        .acct-stat-item.in .acct-stat-value { color: #10b981; font-weight: 600; font-size: 0.9375rem; }
        .acct-stat-item.out .acct-stat-value { color: #ef4444; font-weight: 600; font-size: 0.9375rem; }
        .acct-stat-item.net.positive .acct-stat-value { color: #10b981; font-weight: 700; font-size: 0.9375rem; }
        .acct-stat-item.net.negative .acct-stat-value { color: #ef4444; font-weight: 700; font-size: 0.9375rem; }

        /* Statement Body */
        .acct-statement-body {
          padding: 0 1.25rem 1.25rem;
          border-top: 1px solid #f3f4f6;
        }

        .acct-statement-actions {
          display: flex;
          gap: 0.75rem;
          padding: 0.75rem 0;
        }

        .acct-upload-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.4rem 0.75rem;
          background: white;
          border: 1px dashed #d1d5db;
          border-radius: 8px;
          font-size: 0.8125rem;
          color: #6b7280;
          cursor: pointer;
          transition: all 0.2s;
        }

        .acct-upload-btn:hover { border-color: #10b981; color: #10b981; background: #f0fdf4; }
        .acct-upload-btn.uploading { opacity: 0.6; cursor: wait; }

        .acct-download-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.4rem 0.75rem;
          background: #ecfdf5;
          border: 1px solid #a7f3d0;
          border-radius: 8px;
          font-size: 0.8125rem;
          color: #059669;
          text-decoration: none;
          transition: all 0.2s;
        }

        .acct-download-btn:hover { background: #d1fae5; }

        .acct-line-items { margin-top: 0.75rem; }
        .acct-line-items h5 { font-size: 0.8125rem; font-weight: 600; color: #374151; margin: 0 0 0.5rem 0; }

        .acct-line-table { width: 100%; border-collapse: collapse; }
        .acct-line-table th { text-align: left; font-size: 0.6875rem; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.4rem 0.625rem; border-bottom: 1px solid #f3f4f6; }
        .acct-line-table td { font-size: 0.8125rem; color: #374151; padding: 0.4rem 0.625rem; border-bottom: 1px solid #f9fafb; }
        .acct-line-table tr:last-child td { border-bottom: none; }

        .acct-amount-cell { font-weight: 600; }
        .acct-amount-cell.green { color: #10b981; }
        .acct-amount-cell.red { color: #ef4444; }

        .acct-cat-badge {
          display: inline-block;
          padding: 0.2rem 0.5rem;
          border-radius: 5px;
          font-size: 0.6875rem;
          font-weight: 500;
        }

        /* Expense Section */
        .acct-add-expense-btn {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.5rem 1rem;
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 0.8125rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .acct-add-expense-btn:hover { box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3); transform: translateY(-1px); }

        .acct-expense-filters {
          display: flex;
          gap: 0.75rem;
          padding: 0.75rem 1.25rem;
          border-bottom: 1px solid #f3f4f6;
        }

        .acct-expense-search {
          flex: 1;
          max-width: 350px;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 0.5rem 0.75rem;
        }

        .acct-expense-search svg { color: #9ca3af; flex-shrink: 0; }
        .acct-expense-search input { flex: 1; border: none; outline: none; background: transparent; font-size: 0.8125rem; color: #374151; }
        .acct-expense-search input::placeholder { color: #9ca3af; }
        .acct-search-clear { background: none; border: none; color: #9ca3af; cursor: pointer; padding: 0; display: flex; }

        .acct-expense-filter {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 0.5rem 0.625rem;
          color: #6b7280;
        }

        .acct-expense-filter select { border: none; outline: none; background: transparent; font-size: 0.8125rem; color: #374151; cursor: pointer; -webkit-appearance: none; appearance: none; padding-right: 0.25rem; }

        .acct-expense-table-wrap { overflow-x: auto; }

        .acct-expense-table { width: 100%; border-collapse: collapse; }
        .acct-expense-table th { text-align: left; padding: 0.75rem 1rem; font-size: 0.6875rem; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e5e7eb; background: #f9fafb; }
        .acct-expense-table td { padding: 0.75rem 1rem; font-size: 0.8125rem; color: #374151; border-bottom: 1px solid #f3f4f6; }
        .acct-expense-table tr:last-child td { border-bottom: none; }
        .acct-expense-table tr:hover td { background: #f9fafb; }

        .acct-exp-date { display: flex; align-items: center; gap: 0.375rem; color: #6b7280; white-space: nowrap; }
        .acct-exp-vendor { display: flex; flex-direction: column; }
        .acct-exp-vendor-name { font-weight: 500; color: #111827; }
        .acct-exp-desc { font-size: 0.75rem; color: #9ca3af; max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .acct-exp-method { color: #6b7280; }

        .acct-receipt-link { display: inline-flex; align-items: center; gap: 0.25rem; color: #3b82f6; font-size: 0.8125rem; text-decoration: none; }
        .acct-receipt-link:hover { text-decoration: underline; }

        .acct-exp-actions { display: flex; gap: 0.375rem; }
        .acct-action-btn { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 7px; border: none; background: #f3f4f6; color: #6b7280; cursor: pointer; transition: all 0.2s; }
        .acct-action-btn:hover { background: #e5e7eb; color: #374151; }
        .acct-action-btn.delete:hover { background: #fef2f2; color: #ef4444; }

        /* Empty States */
        .acct-empty { display: flex; flex-direction: column; align-items: center; padding: 3rem 2rem; color: #9ca3af; text-align: center; }
        .acct-empty svg { margin-bottom: 0.75rem; opacity: 0.4; }
        .acct-empty p { margin: 0 0 0.25rem 0; font-size: 0.875rem; color: #6b7280; }
        .acct-empty span { font-size: 0.75rem; }
        .acct-empty.small { padding: 2rem; }
        .acct-empty .acct-add-expense-btn { margin-top: 1rem; }

        /* Modal */
        .acct-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 2rem; }
        .acct-modal { background: white; border-radius: 20px; width: 100%; max-width: 520px; max-height: 90vh; overflow: hidden; display: flex; flex-direction: column; }

        .acct-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 1.25rem 1.5rem; border-bottom: 1px solid #e5e7eb; }
        .acct-modal-header h2 { font-size: 1.125rem; font-weight: 700; color: #111827; margin: 0; }
        .acct-modal-close { display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 9px; border: none; background: #f3f4f6; color: #6b7280; cursor: pointer; transition: all 0.2s; }
        .acct-modal-close:hover { background: #e5e7eb; color: #374151; }

        .acct-modal-body { padding: 1.25rem 1.5rem; overflow-y: auto; }

        .acct-form-row { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 0.875rem; }
        .acct-form-group { display: flex; flex-direction: column; gap: 0.375rem; }
        .acct-form-group.full { grid-column: span 2; }
        .acct-form-group label { font-size: 0.8125rem; font-weight: 500; color: #374151; }
        .acct-form-group input, .acct-form-group select, .acct-form-group textarea { padding: 0.625rem 0.75rem; border: 1px solid #e5e7eb; border-radius: 9px; font-size: 0.8125rem; color: #374151; transition: all 0.2s; }
        .acct-form-group input:focus, .acct-form-group select:focus, .acct-form-group textarea:focus { outline: none; border-color: #10b981; box-shadow: 0 0 0 3px rgba(16,185,129,0.1); }

        .acct-input-icon { position: relative; display: flex; align-items: center; }
        .acct-input-icon svg { position: absolute; left: 0.75rem; color: #9ca3af; }
        .acct-input-icon input { padding-left: 2.25rem; width: 100%; }

        .acct-modal-footer { display: flex; justify-content: flex-end; gap: 0.75rem; padding: 1rem 1.5rem; border-top: 1px solid #e5e7eb; background: #f9fafb; }
        .acct-btn-secondary { padding: 0.625rem 1.125rem; background: white; border: 1px solid #e5e7eb; border-radius: 9px; font-weight: 500; font-size: 0.8125rem; color: #374151; cursor: pointer; transition: all 0.2s; }
        .acct-btn-secondary:hover { background: #f9fafb; }
        .acct-btn-primary { padding: 0.625rem 1.125rem; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border: none; border-radius: 9px; font-weight: 600; font-size: 0.8125rem; color: white; cursor: pointer; transition: all 0.2s; }
        .acct-btn-primary:hover { box-shadow: 0 4px 12px rgba(16,185,129,0.3); }

        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }

        @media (max-width: 1024px) {
          .acct-metrics { grid-template-columns: repeat(2, 1fr); }
        }

        @media (max-width: 768px) {
          .acct-metrics { grid-template-columns: 1fr; }
          .acct-statement-header { flex-direction: column; gap: 0.75rem; align-items: flex-start; }
          .acct-statement-summary { width: 100%; justify-content: space-between; }
          .acct-expense-filters { flex-direction: column; }
          .acct-expense-search { max-width: none; }
          .acct-expense-table { min-width: 700px; }
          .acct-form-row { grid-template-columns: 1fr; }
          .acct-form-group.full { grid-column: span 1; }
        }
      `}</style>
    </div>
  );
}
