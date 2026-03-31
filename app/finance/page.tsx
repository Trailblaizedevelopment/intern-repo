'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  TrendingUp,
  DollarSign,
  AlertCircle,
  CheckCircle,
  Clock,
  BarChart2,
  CreditCard,
  RefreshCw,
  LogIn,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Chapter {
  id: string;
  name: string;
  school?: string;
  payment_amount?: number;
  payment_type?: 'monthly' | 'annual';
  next_payment_date?: string | null;
  status?: string;
}

interface Deal {
  id: string;
  name?: string;
  school?: string;
  organization_name?: string;
  deal_value?: number;
  value?: number;
  stage?: string;
  pipeline_stage?: string;
}

interface StripeInvoice {
  id: string;
  customer_name: string;
  amount: number;
  currency: string;
  due_date: number | null;
  hosted_invoice_url: string | null;
}

interface StripePayment {
  id: string;
  amount: number;
  currency: string;
  created: number;
  description: string;
  customer_email: string | null;
}

interface StripeData {
  upcoming_invoices: StripeInvoice[];
  overdue_invoices: StripeInvoice[];
  recent_payments: StripePayment[];
  subscription_count: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_KEY = 'tb_finance_2026';
const LOCAL_STORAGE_KEY = 'tb_finance_key';
const AUTH_HEADER = 'Bearer hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h';
const HOT_STAGES = ['Negotiation', 'Contract Out', 'Contract Sent', 'Demo Done'];
const STAGE_WEIGHTS: Record<string, number> = {
  'Demo Done': 0.25,
  'Negotiation': 0.50,
  'Contract Out': 0.75,
  'Contract Sent': 0.90,
};

// ─── Utility ──────────────────────────────────────────────────────────────────

function fmt(cents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

function fmtDollars(dollars: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(dollars);
}

function paymentStatus(nextDate?: string | null): 'overdue' | 'due-soon' | 'current' {
  if (!nextDate) return 'current';
  const d = new Date(nextDate).getTime();
  const now = Date.now();
  if (d < now) return 'overdue';
  if (d - now <= 7 * 24 * 60 * 60 * 1000) return 'due-soon';
  return 'current';
}

function fmtDate(ts: number | null | undefined) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  color = '#10b981',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div style={{
      background: '#111118',
      border: '1px solid #1e1e2e',
      borderRadius: 12,
      padding: '20px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280', fontSize: 13 }}>
        <span style={{ color }}>{icon}</span>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#f9fafb', letterSpacing: '-0.5px' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#6b7280' }}>{sub}</div>}
    </div>
  );
}

function SectionHeader({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <span style={{ color: '#818cf8' }}>{icon}</span>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: '#f9fafb', margin: 0 }}>{title}</h2>
    </div>
  );
}

function StatusBadge({ status }: { status: 'overdue' | 'due-soon' | 'current' }) {
  const map = {
    overdue: { label: 'Overdue', bg: '#451a2a', color: '#f87171' },
    'due-soon': { label: 'Due Soon', bg: '#3d2e0a', color: '#fbbf24' },
    current: { label: 'Current', bg: '#0d2a1f', color: '#34d399' },
  };
  const s = map[status];
  return (
    <span style={{
      background: s.bg,
      color: s.color,
      borderRadius: 6,
      padding: '2px 8px',
      fontSize: 12,
      fontWeight: 500,
    }}>{s.label}</span>
  );
}

// ─── PIN screen ───────────────────────────────────────────────────────────────

function PinScreen({ onAuth }: { onAuth: () => void }) {
  const [val, setVal] = useState('');
  const [err, setErr] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (val.trim() === VALID_KEY) {
      localStorage.setItem(LOCAL_STORAGE_KEY, VALID_KEY);
      onAuth();
    } else {
      setErr('Invalid access key. Please try again.');
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        background: '#111118',
        border: '1px solid #1e1e2e',
        borderRadius: 16,
        padding: '40px 48px',
        width: 360,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#f9fafb', marginBottom: 4 }}>Trailblaize</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 32 }}>Finance Dashboard</div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="password"
            placeholder="Enter access key"
            value={val}
            onChange={(e) => { setVal(e.target.value); setErr(''); }}
            style={{
              background: '#0a0a0f',
              border: '1px solid #1e1e2e',
              borderRadius: 8,
              padding: '10px 14px',
              color: '#f9fafb',
              fontSize: 14,
              outline: 'none',
            }}
            autoFocus
          />
          {err && <div style={{ color: '#f87171', fontSize: 13 }}>{err}</div>}
          <button
            type="submit"
            style={{
              background: '#4f46e5',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '10px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <LogIn size={16} /> Unlock Dashboard
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

function Dashboard() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stripeData, setStripeData] = useState<StripeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const loadData = useCallback(async () => {
    setLoading(true);
    const errs: string[] = [];

    // ── Chapters ──
    try {
      const res = await fetch('/api/chapters', {
        headers: { Authorization: AUTH_HEADER },
      });
      if (res.ok) {
        const data = await res.json();
        setChapters(Array.isArray(data) ? data : (data.chapters ?? data.data ?? []));
      } else {
        errs.push(`Chapters API: ${res.status}`);
      }
    } catch (e) {
      errs.push(`Chapters: ${e instanceof Error ? e.message : 'fetch error'}`);
    }

    // ── Deals ──
    try {
      const res = await fetch('/api/deals', {
        headers: { Authorization: AUTH_HEADER },
      });
      if (res.ok) {
        const data = await res.json();
        const dealsArr = Array.isArray(data) ? data : (data.deals ?? data.data ?? []);
        if (dealsArr.length > 0) {
          setDeals(dealsArr);
        } else {
          throw new Error('empty');
        }
      } else {
        throw new Error(`${res.status}`);
      }
    } catch {
      // Fallback to workspace leads
      try {
        const res2 = await fetch('/api/workspace/leads', {
          headers: { Authorization: AUTH_HEADER },
        });
        if (res2.ok) {
          const data2 = await res2.json();
          setDeals(Array.isArray(data2) ? data2 : (data2.leads ?? data2.data ?? []));
        } else {
          errs.push(`Deals/Leads API: ${res2.status}`);
        }
      } catch (e2) {
        errs.push(`Deals: ${e2 instanceof Error ? e2.message : 'fetch error'}`);
      }
    }

    // ── Stripe ──
    try {
      const res = await fetch('/api/finance/stripe');
      if (res.ok) {
        const data = await res.json();
        setStripeData(data);
      } else {
        const err = await res.json().catch(() => ({}));
        errs.push(`Stripe: ${err.error ?? res.status}`);
      }
    } catch (e) {
      errs.push(`Stripe: ${e instanceof Error ? e.message : 'fetch error'}`);
    }

    setErrors(errs);
    setLoading(false);
    setLastRefresh(new Date());
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Derived MRR/ARR ──
  const activeChapters = chapters.filter((c) => c.status !== 'inactive' && c.payment_amount);
  const mrr = activeChapters.reduce((sum, c) => {
    const amt = c.payment_amount ?? 0;
    if (c.payment_type === 'annual') return sum + amt / 12;
    return sum + amt; // monthly or unset
  }, 0);
  const arr = mrr * 12;

  // ── Derived Pipeline ──
  const hotDeals = deals.filter((d) => {
    const stage = d.stage ?? d.pipeline_stage ?? '';
    return HOT_STAGES.some((s) => stage.toLowerCase().includes(s.toLowerCase()));
  });
  const pipelineTotal = hotDeals.reduce((s, d) => s + (d.deal_value ?? d.value ?? 0), 0);
  const weightedPipeline = hotDeals.reduce((s, d) => {
    const stage = d.stage ?? d.pipeline_stage ?? '';
    const weight = STAGE_WEIGHTS[HOT_STAGES.find((hs) => stage.toLowerCase().includes(hs.toLowerCase())) ?? ''] ?? 0;
    return s + (d.deal_value ?? d.value ?? 0) * weight;
  }, 0);

  const overdueCount = (stripeData?.overdue_invoices.length ?? 0) +
    activeChapters.filter((c) => paymentStatus(c.next_payment_date) === 'overdue').length;

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 14,
  };
  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '8px 12px',
    color: '#6b7280',
    fontSize: 12,
    fontWeight: 500,
    borderBottom: '1px solid #1e1e2e',
  };
  const tdStyle: React.CSSProperties = {
    padding: '10px 12px',
    color: '#d1d5db',
    borderBottom: '1px solid #13131f',
    verticalAlign: 'middle',
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#f9fafb', letterSpacing: '-0.3px' }}>Trailblaize</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>Finance Dashboard</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: '#4b5563' }}>
            Last refresh: {lastRefresh.toLocaleTimeString()}
          </span>
          <button
            onClick={loadData}
            disabled={loading}
            style={{
              background: '#1e1e2e',
              border: '1px solid #2d2d44',
              borderRadius: 8,
              padding: '6px 12px',
              color: '#9ca3af',
              cursor: loading ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
            }}
          >
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error banners */}
      {errors.length > 0 && (
        <div style={{ background: '#1f0a0a', border: '1px solid #5b1a1a', borderRadius: 8, padding: '10px 16px', marginBottom: 24, fontSize: 13, color: '#f87171' }}>
          ⚠️ {errors.join(' · ')}
        </div>
      )}

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 40 }}>
        <StatCard
          icon={<DollarSign size={16} />}
          label="Monthly Recurring"
          value={fmtDollars(mrr)}
          sub="MRR"
          color="#10b981"
        />
        <StatCard
          icon={<TrendingUp size={16} />}
          label="Annual Recurring"
          value={fmtDollars(arr)}
          sub="ARR"
          color="#10b981"
        />
        <StatCard
          icon={<BarChart2 size={16} />}
          label="Hot Pipeline"
          value={fmtDollars(pipelineTotal)}
          sub={`${hotDeals.length} deals · ${fmtDollars(weightedPipeline)} weighted`}
          color="#818cf8"
        />
        <StatCard
          icon={<AlertCircle size={16} />}
          label="Overdue"
          value={String(overdueCount)}
          sub="chapters + invoices"
          color={overdueCount > 0 ? '#f87171' : '#10b981'}
        />
      </div>

      {/* ── SECTION 1: MRR / ARR ── */}
      <div style={{ background: '#111118', border: '1px solid #1e1e2e', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <SectionHeader title="MRR / ARR — Active Chapters" icon={<DollarSign size={18} />} />
        {loading ? (
          <div style={{ color: '#6b7280', fontSize: 14 }}>Loading chapters…</div>
        ) : activeChapters.length === 0 ? (
          <div style={{ color: '#6b7280', fontSize: 14 }}>No active chapters found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Chapter</th>
                  <th style={thStyle}>School</th>
                  <th style={thStyle}>Amount</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Next Payment</th>
                  <th style={thStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {activeChapters.map((c) => {
                  const st = paymentStatus(c.next_payment_date);
                  return (
                    <tr key={c.id}>
                      <td style={tdStyle}>{c.name ?? '—'}</td>
                      <td style={tdStyle}>{c.school ?? '—'}</td>
                      <td style={{ ...tdStyle, color: '#f9fafb', fontWeight: 500 }}>
                        {fmtDollars(c.payment_amount ?? 0)}
                        <span style={{ color: '#6b7280', fontWeight: 400, fontSize: 12, marginLeft: 4 }}>
                          /{c.payment_type === 'annual' ? 'yr' : 'mo'}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          background: c.payment_type === 'annual' ? '#1a1a3a' : '#0f2a1a',
                          color: c.payment_type === 'annual' ? '#818cf8' : '#34d399',
                          borderRadius: 6, padding: '2px 8px', fontSize: 12,
                        }}>
                          {c.payment_type ?? 'monthly'}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: '#9ca3af', fontSize: 13 }}>
                        {c.next_payment_date
                          ? new Date(c.next_payment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : '—'}
                      </td>
                      <td style={tdStyle}><StatusBadge status={st} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ display: 'flex', gap: 24, marginTop: 16, paddingTop: 16, borderTop: '1px solid #1e1e2e' }}>
          <div style={{ fontSize: 13, color: '#6b7280' }}>
            MRR: <span style={{ color: '#10b981', fontWeight: 600 }}>{fmtDollars(mrr)}</span>
          </div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>
            ARR: <span style={{ color: '#10b981', fontWeight: 600 }}>{fmtDollars(arr)}</span>
          </div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>
            Active chapters: <span style={{ color: '#f9fafb', fontWeight: 600 }}>{activeChapters.length}</span>
          </div>
        </div>
      </div>

      {/* ── SECTION 2: Pipeline ── */}
      <div style={{ background: '#111118', border: '1px solid #1e1e2e', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <SectionHeader title="Hot Pipeline" icon={<BarChart2 size={18} />} />
        {loading ? (
          <div style={{ color: '#6b7280', fontSize: 14 }}>Loading pipeline…</div>
        ) : hotDeals.length === 0 ? (
          <div style={{ color: '#6b7280', fontSize: 14 }}>No hot pipeline deals found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>School / Org</th>
                  <th style={thStyle}>Deal Value</th>
                  <th style={thStyle}>Stage</th>
                  <th style={thStyle}>Weight</th>
                  <th style={thStyle}>Weighted Value</th>
                </tr>
              </thead>
              <tbody>
                {hotDeals.map((d) => {
                  const stage = d.stage ?? d.pipeline_stage ?? '';
                  const matchedStage = HOT_STAGES.find((hs) => stage.toLowerCase().includes(hs.toLowerCase())) ?? '';
                  const weight = STAGE_WEIGHTS[matchedStage] ?? 0;
                  const val = d.deal_value ?? d.value ?? 0;
                  const stageColors: Record<string, string> = {
                    'Demo Done': '#818cf8',
                    'Negotiation': '#fbbf24',
                    'Contract Out': '#f97316',
                    'Contract Sent': '#10b981',
                  };
                  const stageColor = stageColors[matchedStage] ?? '#9ca3af';
                  return (
                    <tr key={d.id}>
                      <td style={tdStyle}>{d.name ?? d.organization_name ?? '—'}</td>
                      <td style={tdStyle}>{d.school ?? '—'}</td>
                      <td style={{ ...tdStyle, color: '#f9fafb', fontWeight: 500 }}>{fmtDollars(val)}</td>
                      <td style={tdStyle}>
                        <span style={{ color: stageColor, fontSize: 13 }}>{matchedStage || stage}</span>
                      </td>
                      <td style={{ ...tdStyle, color: '#9ca3af' }}>{(weight * 100).toFixed(0)}%</td>
                      <td style={{ ...tdStyle, color: '#a78bfa', fontWeight: 500 }}>{fmtDollars(val * weight)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ display: 'flex', gap: 24, marginTop: 16, paddingTop: 16, borderTop: '1px solid #1e1e2e' }}>
          <div style={{ fontSize: 13, color: '#6b7280' }}>
            Total hot pipeline: <span style={{ color: '#818cf8', fontWeight: 600 }}>{fmtDollars(pipelineTotal)}</span>
          </div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>
            Weighted estimate: <span style={{ color: '#a78bfa', fontWeight: 600 }}>{fmtDollars(weightedPipeline)}</span>
          </div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>
            Hot deals: <span style={{ color: '#f9fafb', fontWeight: 600 }}>{hotDeals.length}</span>
          </div>
        </div>
      </div>

      {/* ── SECTION 3: Stripe ── */}
      <div style={{ background: '#111118', border: '1px solid #1e1e2e', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <SectionHeader title="Stripe Payouts" icon={<CreditCard size={18} />} />

        {loading ? (
          <div style={{ color: '#6b7280', fontSize: 14 }}>Loading Stripe data…</div>
        ) : !stripeData ? (
          <div style={{ color: '#f87171', fontSize: 14 }}>Stripe data unavailable. Check STRIPE_SECRET_KEY.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            {/* Active subscriptions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <CheckCircle size={18} color="#10b981" />
              <span style={{ color: '#d1d5db', fontSize: 14 }}>
                Active Stripe subscriptions:{' '}
                <span style={{ color: '#10b981', fontWeight: 700, fontSize: 16 }}>
                  {stripeData.subscription_count}
                </span>
              </span>
            </div>

            {/* Overdue invoices */}
            {stripeData.overdue_invoices.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <AlertCircle size={16} color="#f87171" />
                  <span style={{ color: '#f87171', fontSize: 14, fontWeight: 600 }}>
                    Overdue Invoices ({stripeData.overdue_invoices.length})
                  </span>
                </div>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Customer</th>
                      <th style={thStyle}>Amount</th>
                      <th style={thStyle}>Due Date</th>
                      <th style={thStyle}>Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stripeData.overdue_invoices.map((inv) => (
                      <tr key={inv.id} style={{ background: 'rgba(248,113,113,0.05)' }}>
                        <td style={{ ...tdStyle, color: '#fca5a5' }}>{inv.customer_name ?? inv.id}</td>
                        <td style={{ ...tdStyle, color: '#f87171', fontWeight: 600 }}>{fmt(inv.amount, inv.currency)}</td>
                        <td style={{ ...tdStyle, color: '#f87171' }}>{fmtDate(inv.due_date)}</td>
                        <td style={tdStyle}>
                          {inv.hosted_invoice_url ? (
                            <a href={inv.hosted_invoice_url} target="_blank" rel="noreferrer"
                              style={{ color: '#818cf8', fontSize: 12, textDecoration: 'none' }}>View →</a>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Upcoming invoices */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Clock size={16} color="#fbbf24" />
                <span style={{ color: '#fbbf24', fontSize: 14, fontWeight: 600 }}>
                  Upcoming Invoices — Next 30 Days ({stripeData.upcoming_invoices.length})
                </span>
              </div>
              {stripeData.upcoming_invoices.length === 0 ? (
                <div style={{ fontSize: 13, color: '#6b7280' }}>No invoices due in the next 30 days.</div>
              ) : (
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Customer</th>
                      <th style={thStyle}>Amount</th>
                      <th style={thStyle}>Due Date</th>
                      <th style={thStyle}>Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stripeData.upcoming_invoices.map((inv) => (
                      <tr key={inv.id}>
                        <td style={tdStyle}>{inv.customer_name ?? inv.id}</td>
                        <td style={{ ...tdStyle, color: '#fbbf24', fontWeight: 500 }}>{fmt(inv.amount, inv.currency)}</td>
                        <td style={{ ...tdStyle, color: '#9ca3af' }}>{fmtDate(inv.due_date)}</td>
                        <td style={tdStyle}>
                          {inv.hosted_invoice_url ? (
                            <a href={inv.hosted_invoice_url} target="_blank" rel="noreferrer"
                              style={{ color: '#818cf8', fontSize: 12, textDecoration: 'none' }}>View →</a>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Recent payments */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <CheckCircle size={16} color="#10b981" />
                <span style={{ color: '#10b981', fontSize: 14, fontWeight: 600 }}>
                  Recent Successful Payments
                </span>
              </div>
              {stripeData.recent_payments.length === 0 ? (
                <div style={{ fontSize: 13, color: '#6b7280' }}>No recent payments.</div>
              ) : (
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Description</th>
                      <th style={thStyle}>Customer</th>
                      <th style={thStyle}>Amount</th>
                      <th style={thStyle}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stripeData.recent_payments.map((p) => (
                      <tr key={p.id}>
                        <td style={tdStyle}>{p.description ?? '—'}</td>
                        <td style={{ ...tdStyle, color: '#9ca3af' }}>{p.customer_email ?? '—'}</td>
                        <td style={{ ...tdStyle, color: '#34d399', fontWeight: 500 }}>{fmt(p.amount, p.currency)}</td>
                        <td style={{ ...tdStyle, color: '#6b7280', fontSize: 13 }}>{fmtDate(p.created)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', fontSize: 12, color: '#374151', paddingTop: 8, paddingBottom: 16 }}>
        Trailblaize Finance · Confidential · {new Date().getFullYear()}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        * { box-sizing: border-box; }
        body { margin: 0; }
        input:focus { border-color: #4f46e5 !important; }
        tr:hover td { background: rgba(255,255,255,0.015); }
      `}</style>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FinancePage() {
  const [authed, setAuthed] = useState<boolean | null>(null); // null = loading

  useEffect(() => {
    // Check URL param first
    const params = new URLSearchParams(window.location.search);
    if (params.get('key') === VALID_KEY) {
      localStorage.setItem(LOCAL_STORAGE_KEY, VALID_KEY);
      setAuthed(true);
      return;
    }
    // Check localStorage
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    setAuthed(stored === VALID_KEY);
  }, []);

  // Loading state (avoids flash)
  if (authed === null) {
    return (
      <div style={{ background: '#0a0a0f', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#4b5563', fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  if (!authed) {
    return <PinScreen onAuth={() => setAuthed(true)} />;
  }

  return <Dashboard />;
}
