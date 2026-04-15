'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Target,
  TrendingUp,
  DollarSign,
  Search,
  X,
  Plus,
  Building2,
  RefreshCw,
  CheckCircle2,
  Mail,
  MessageSquare,
  Instagram,
  Upload,
  Calendar,
  Users,
  Zap,
  ChevronDown,
  Edit3,
  MapPin,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
type SchoolStatus = 'active_client' | 'in_pipeline' | 'not_contacted';
type OutreachStatus = 'not_contacted' | 'contacted' | 'demo_booked' | 'signed';
type OutreachMethod = 'email' | 'text' | 'instagram_dm';
type ContactType = 'president' | 'alumni_chair' | 'rush_chair' | 'other';

interface OrgDeal {
  id: string;
  stage: string;
  value: number;
  assigned_to: string | null;
}

interface OrgEntry {
  id: string;
  name: string;
  deals: OrgDeal[];
}

interface ActiveChapter {
  id: string;
  chapter_name: string;
  mrr: number;
}

interface School {
  id: string;
  name: string;
  state: string | null;
  conference: string | null;
  fraternities: OrgEntry[];
  sororities: OrgEntry[];
  activeChapters: ActiveChapter[];
  pipelineValue: number;
  dealCount: number;
  status: SchoolStatus;
}

interface KPIs {
  totalActiveChapters: number;
  schoolsWithActiveClient: number;
  schoolsInPipeline: number;
  totalPipelineValue: number;
  statesCovered: number;
}

interface OutreachEntry {
  status: OutreachStatus;
  method: OutreachMethod;
  contactType: ContactType;
  contactedAt: string;
  notes: string;
  dealId?: string;
}

type OutreachLog = Record<string, OutreachEntry>;

interface FounderTarget {
  schoolId: string;
  schoolName: string;
}

type FounderTargetsMap = Record<string, FounderTarget | null>;

interface DealDetail {
  id: string;
  stage: string;
  value: number;
  temperature: string | null;
  next_followup: string | null;
  notes: string | null;
  assigned_to: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────
const FOUNDERS = ['Owen', 'Ford', 'Adam'] as const;
type Founder = (typeof FOUNDERS)[number];

const FOUNDER_COLORS: Record<Founder, { bg: string; text: string; border: string; dot: string; accent: string }> = {
  Owen: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', dot: 'bg-amber-500', accent: '#C4874A' },
  Ford: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200', dot: 'bg-blue-500', accent: '#2563eb' },
  Adam: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', dot: 'bg-emerald-500', accent: '#059669' },
};

const OUTREACH_STATUS_CONFIG: Record<OutreachStatus, { label: string; color: string; bg: string; border: string }> = {
  not_contacted: { label: 'Not Contacted', color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
  contacted:     { label: 'Contacted',     color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  demo_booked:   { label: 'Demo Booked',   color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  signed:        { label: 'Signed',        color: '#065f46', bg: '#ecfdf5', border: '#6ee7b7' },
};

const STAGE_OPTIONS = [
  { value: 'lead',          label: 'New Lead' },
  { value: 'demo_booked',   label: 'Demo Booked' },
  { value: 'first_demo',    label: 'First Demo' },
  { value: 'second_call',   label: 'Second Call' },
  { value: 'contract_sent', label: 'Contract Sent' },
  { value: 'closed_won',    label: 'Closed Won' },
];

const TEMP_OPTIONS = [
  { value: 'hot',  label: '🔥 Hot' },
  { value: 'warm', label: '🟡 Warm' },
  { value: 'cold', label: '🧊 Cold' },
];

function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

// ── KPI Chip ───────────────────────────────────────────────────────────────
function KpiChip({ icon, label, value, color }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm min-w-0">
      <div
        className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: `${color}18`, color }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide leading-none truncate">{label}</p>
        <p className="text-base font-bold text-[#1B2A4A] leading-tight mt-0.5">{value}</p>
      </div>
    </div>
  );
}

// ── Method Pill ────────────────────────────────────────────────────────────
function MethodPill({ method }: { method: OutreachMethod }) {
  const cfg = {
    email:        { label: 'Email',  icon: <Mail size={10} />,        color: 'text-blue-700 bg-blue-50 border-blue-200' },
    text:         { label: 'Text',   icon: <MessageSquare size={10} />, color: 'text-green-700 bg-green-50 border-green-200' },
    instagram_dm: { label: 'IG DM', icon: <Instagram size={10} />,    color: 'text-pink-700 bg-pink-50 border-pink-200' },
  }[method];
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border font-medium ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ── Chapter Row ────────────────────────────────────────────────────────────
function ChapterRow({
  org,
  type,
  outreachEntry,
  onLogContact,
  onViewDeal,
}: {
  org: OrgEntry;
  type: 'fraternity' | 'sorority';
  outreachEntry: OutreachEntry | undefined;
  onLogContact: (org: OrgEntry, type: 'fraternity' | 'sorority') => void;
  onViewDeal: (org: OrgEntry) => void;
}) {
  const status: OutreachStatus = outreachEntry?.status ?? 'not_contacted';
  const statusCfg = OUTREACH_STATUS_CONFIG[status];
  const primaryDeal = org.deals[0];
  const contactName = primaryDeal?.assigned_to ?? null;

  return (
    <div className="flex items-center gap-3 py-3.5 px-5 border-b border-gray-100 hover:bg-[#FAFAF8] transition-colors last:border-0">
      {/* Name */}
      <span className="flex-1 text-sm font-semibold text-[#1B2A4A] truncate min-w-0">{org.name}</span>

      {/* Status pill */}
      <span
        className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border"
        style={{ color: statusCfg.color, backgroundColor: statusCfg.bg, borderColor: statusCfg.border }}
      >
        {statusCfg.label}
      </span>

      {/* Method pill */}
      {outreachEntry && (
        <MethodPill method={outreachEntry.method} />
      )}

      {/* Contact name */}
      <span className="flex-shrink-0 text-xs text-gray-400 hidden md:block w-28 truncate">
        {contactName ?? 'No contact logged'}
      </span>

      {/* Last contacted date */}
      {outreachEntry?.contactedAt ? (
        <span className="flex-shrink-0 text-xs text-gray-400 hidden lg:block w-16">
          {new Date(outreachEntry.contactedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      ) : (
        <span className="flex-shrink-0 text-xs text-gray-300 hidden lg:block w-16">—</span>
      )}

      {/* Actions — always visible */}
      <div className="flex-shrink-0 flex items-center gap-1.5">
        <button
          onClick={() => onLogContact(org, type)}
          className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#1B2A4A] text-white hover:bg-[#243560] transition-colors whitespace-nowrap"
        >
          <Plus size={11} />
          Log Contact
        </button>
        <button
          onClick={() => onViewDeal(org)}
          className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
            primaryDeal
              ? 'bg-[#C4874A] text-white hover:bg-[#b07640]'
              : 'border border-gray-200 text-gray-400 hover:bg-gray-50'
          }`}
        >
          View Deal
        </button>
      </div>
    </div>
  );
}

// ── Log Contact Drawer ─────────────────────────────────────────────────────
function LogContactDrawer({
  org,
  orgType,
  schoolId,
  schoolName,
  onClose,
  onSaved,
}: {
  org: OrgEntry;
  orgType: 'fraternity' | 'sorority';
  schoolId: string;
  schoolName: string;
  onClose: () => void;
  onSaved: (orgId: string, entry: OutreachEntry) => void;
}) {
  const [contactType, setContactType] = useState<ContactType>('president');
  const [method, setMethod] = useState<OutreachMethod>('email');
  const [notes, setNotes] = useState('');
  const [createDeal, setCreateDeal] = useState(true);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      let dealId: string | undefined;

      if (createDeal) {
        const res = await fetch('/api/pipeline/deals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            org_id: org.id,
            stage: 'lead',
            value: 0,
            deal_type: orgType,
            notes: notes || null,
          }),
        });
        if (res.ok) {
          const deal = await res.json();
          dealId = deal.id;
        }
      }

      const entry: OutreachEntry = {
        status: 'contacted',
        method,
        contactType,
        contactedAt: new Date().toISOString(),
        notes,
        dealId,
      };

      onSaved(org.id, entry);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  const methodOptions: { value: OutreachMethod; label: string; icon: React.ReactNode }[] = [
    { value: 'email',        label: 'Email',        icon: <Mail size={14} /> },
    { value: 'text',         label: 'Text',         icon: <MessageSquare size={14} /> },
    { value: 'instagram_dm', label: 'Instagram DM', icon: <Instagram size={14} /> },
  ];

  const contactOptions: { value: ContactType; label: string }[] = [
    { value: 'president',    label: 'President' },
    { value: 'alumni_chair', label: 'Alumni Chair' },
    { value: 'rush_chair',   label: 'Rush Chair' },
    { value: 'other',        label: 'Other' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="w-[420px] bg-white shadow-2xl flex flex-col h-full border-l border-gray-100">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-[#FAFAF8]">
          <div>
            <h2 className="font-bold text-[#1B2A4A] text-base" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
              Log Contact
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">{org.name} · {schoolName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Who did you reach? */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Who did you reach?
            </label>
            <div className="grid grid-cols-2 gap-2">
              {contactOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setContactType(opt.value)}
                  className={`py-2 px-3 text-sm rounded-lg border font-medium transition-colors ${
                    contactType === opt.value
                      ? 'bg-[#1B2A4A] text-white border-[#1B2A4A]'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Method */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Contact Method
            </label>
            <div className="flex gap-2">
              {methodOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setMethod(opt.value)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm rounded-lg border font-medium transition-colors ${
                    method === opt.value
                      ? 'bg-[#C4874A] text-white border-[#C4874A]'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {opt.icon}
                  <span className="hidden sm:inline">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What happened? Key details from the conversation..."
              rows={4}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20 focus:border-[#1B2A4A]/40 resize-none bg-white"
            />
          </div>

          {/* Create deal checkbox */}
          <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
            <div className="relative mt-0.5">
              <input
                type="checkbox"
                checked={createDeal}
                onChange={(e) => setCreateDeal(e.target.checked)}
                className="sr-only"
              />
              <div
                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                  createDeal ? 'bg-[#1B2A4A] border-[#1B2A4A]' : 'bg-white border-gray-300'
                }`}
              >
                {createDeal && <CheckCircle2 size={12} className="text-white" />}
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Create pipeline deal</p>
              <p className="text-xs text-gray-500 mt-0.5">Add this chapter as a new lead in the pipeline</p>
            </div>
          </label>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 text-sm font-bold text-white bg-[#1B2A4A] rounded-xl hover:bg-[#243560] transition-colors disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Contact'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── View Deal Drawer ───────────────────────────────────────────────────────
function ViewDealDrawer({
  org,
  onClose,
  onSaved,
}: {
  org: OrgEntry;
  onClose: () => void;
  onSaved: () => void;
}) {
  const primaryDeal = org.deals[0];
  const [deal, setDeal] = useState<DealDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stage, setStage] = useState('');
  const [temperature, setTemperature] = useState('');
  const [nextFollowup, setNextFollowup] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!primaryDeal) { setLoading(false); return; }
    fetch(`/api/pipeline/deals/${primaryDeal.id}`)
      .then((r) => r.json())
      .then((d) => {
        setDeal(d);
        setStage(d.stage ?? 'lead');
        setTemperature(d.temperature ?? '');
        setNextFollowup(d.next_followup ?? '');
        setNotes(d.notes ?? '');
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [primaryDeal]);

  async function handleSave() {
    if (!deal) return;
    setSaving(true);
    try {
      await fetch(`/api/pipeline/deals/${deal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage,
          temperature: temperature || null,
          next_followup: nextFollowup || null,
          notes: notes || null,
        }),
      });
      onSaved();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="w-[420px] bg-white shadow-2xl flex flex-col h-full border-l border-gray-100">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-[#FAFAF8]">
          <div>
            <h2 className="font-bold text-[#1B2A4A] text-base" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
              Pipeline Deal
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">{org.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#1B2A4A]" />
            </div>
          ) : !deal ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
                <Building2 size={22} className="text-gray-300" />
              </div>
              <p className="text-sm font-medium text-gray-500">No deal found</p>
              <p className="text-xs text-gray-400 mt-1">Log a contact first to create a pipeline deal</p>
            </div>
          ) : (
            <>
              {/* Stage */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Stage
                </label>
                <div className="relative">
                  <select
                    value={stage}
                    onChange={(e) => setStage(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 pr-8 focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20 focus:border-[#1B2A4A]/40 appearance-none bg-white"
                  >
                    {STAGE_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Temperature */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Temperature
                </label>
                <div className="flex gap-2">
                  {TEMP_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setTemperature(opt.value === temperature ? '' : opt.value)}
                      className={`flex-1 py-2 text-sm rounded-xl border font-medium transition-colors ${
                        temperature === opt.value
                          ? 'bg-[#C4874A] text-white border-[#C4874A]'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Next follow-up */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Next Follow-up
                </label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="date"
                    value={nextFollowup}
                    onChange={(e) => setNextFollowup(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-xl pl-9 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20 focus:border-[#1B2A4A]/40"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Deal notes, context, next steps..."
                  rows={4}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20 focus:border-[#1B2A4A]/40 resize-none"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {deal && (
          <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 text-sm font-bold text-white bg-[#1B2A4A] rounded-xl hover:bg-[#243560] transition-colors disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Import Chapters Modal ──────────────────────────────────────────────────
function ImportChaptersModal({
  school,
  existingOrgs,
  onClose,
  onImported,
}: {
  school: School;
  existingOrgs: OrgEntry[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [text, setText] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ added: string[]; skipped: string[] } | null>(null);

  async function handleImport() {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;

    setImporting(true);
    const added: string[] = [];
    const skipped: string[] = [];

    const existingNames = new Set(existingOrgs.map((o) => o.name.toLowerCase()));

    for (const name of lines) {
      if (existingNames.has(name.toLowerCase())) {
        skipped.push(name);
        continue;
      }
      try {
        const res = await fetch('/api/pipeline/orgs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            school_id: school.id,
            type: 'fraternity',
            status: 'prospect',
          }),
        });
        if (res.ok) {
          added.push(name);
        } else {
          skipped.push(name);
        }
      } catch {
        skipped.push(name);
      }
    }

    setResult({ added, skipped });
    setImporting(false);
    if (added.length > 0) {
      onImported();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-[#FAFAF8] rounded-t-2xl">
          <div>
            <h2 className="font-bold text-[#1B2A4A] text-base" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
              Import Chapters
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">{school.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {!result ? (
            <>
              <p className="text-sm text-gray-600">
                Paste chapter names below, one per line. Existing chapters will be skipped.
              </p>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={'Alpha Phi Alpha\nKappa Alpha Psi\nPhi Beta Sigma'}
                rows={8}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1B2A4A]/20 focus:border-[#1B2A4A]/40 resize-none font-mono"
              />
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={importing || !text.trim()}
                  className="flex-1 py-2.5 text-sm font-bold text-white bg-[#1B2A4A] rounded-xl hover:bg-[#243560] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {importing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload size={15} />
                      Import
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-3">
                {result.added.length > 0 && (
                  <div className="bg-green-50 border border-green-100 rounded-xl p-4">
                    <p className="text-sm font-semibold text-green-800 mb-2">
                      ✅ Added {result.added.length} chapter{result.added.length !== 1 ? 's' : ''}
                    </p>
                    <ul className="space-y-1">
                      {result.added.map((n) => (
                        <li key={n} className="text-xs text-green-700">{n}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.skipped.length > 0 && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <p className="text-sm font-semibold text-gray-600 mb-2">
                      ⏭ Skipped {result.skipped.length} (already exist or failed)
                    </p>
                    <ul className="space-y-1">
                      {result.skipped.map((n) => (
                        <li key={n} className="text-xs text-gray-500">{n}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <button
                onClick={onClose}
                className="w-full py-2.5 text-sm font-bold text-white bg-[#1B2A4A] rounded-xl hover:bg-[#243560] transition-colors"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Founder Target Board ───────────────────────────────────────────────────
function FounderTargetBoard({
  schools,
  outreachLog,
  founderTargets,
  onTargetChange,
  onSelectSchool,
}: {
  schools: School[];
  outreachLog: OutreachLog;
  founderTargets: FounderTargetsMap;
  onTargetChange: (founder: Founder, target: FounderTarget | null) => void;
  onSelectSchool: (school: School) => void;
}) {
  const [editingFounder, setEditingFounder] = useState<Founder | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return schools.slice(0, 6);
    const q = searchQuery.toLowerCase();
    return schools.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 6);
  }, [schools, searchQuery]);

  function getProgress(target: FounderTarget | null): { contacted: number; total: number } {
    if (!target) return { contacted: 0, total: 0 };
    const school = schools.find((s) => s.id === target.schoolId);
    if (!school) return { contacted: 0, total: 0 };
    const allOrgs = [...school.fraternities, ...school.sororities];
    const total = allOrgs.length;
    const contacted = allOrgs.filter((o) => {
      const entry = outreachLog[o.id];
      return entry && entry.status !== 'not_contacted';
    }).length;
    return { contacted, total };
  }

  useEffect(() => {
    if (editingFounder && searchRef.current) {
      searchRef.current.focus();
    }
  }, [editingFounder]);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Board header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#C4874A18' }}>
          <Zap size={15} className="text-[#C4874A]" />
        </div>
        <div>
          <h2 className="font-bold text-[#1B2A4A] text-sm" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
            Founder Target Board
          </h2>
          <p className="text-xs text-gray-400">Today&apos;s school targets</p>
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-gray-100">
        {FOUNDERS.map((founder) => {
          const target = founderTargets[founder] ?? null;
          const fc = FOUNDER_COLORS[founder];
          const progress = getProgress(target);
          const isEditing = editingFounder === founder;
          const pct = progress.total > 0 ? Math.round((progress.contacted / progress.total) * 100) : 0;

          return (
            <div key={founder} className="p-5 relative">
              {/* Founder header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: fc.accent }}
                  >
                    {founder[0]}
                  </span>
                  <span className="font-bold text-[#1B2A4A] text-sm">{founder}</span>
                </div>
                <button
                  onClick={() => {
                    if (isEditing) {
                      setEditingFounder(null);
                      setSearchQuery('');
                    } else {
                      setEditingFounder(founder);
                      setSearchQuery('');
                    }
                  }}
                  className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-200"
                >
                  <Edit3 size={10} />
                  {target ? 'Change' : 'Set'}
                </button>
              </div>

              {/* Search dropdown when editing */}
              {isEditing && (
                <div className="mb-4 relative z-20">
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      ref={searchRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search school..."
                      className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300/50 focus:border-amber-300"
                    />
                  </div>
                  <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden z-30">
                    {searchResults.map((school) => (
                      <button
                        key={school.id}
                        onClick={() => {
                          onTargetChange(founder, { schoolId: school.id, schoolName: school.name });
                          setEditingFounder(null);
                          setSearchQuery('');
                        }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-amber-50 transition-colors flex items-center justify-between border-b border-gray-50 last:border-0"
                      >
                        <span className="font-medium text-gray-800 truncate">{school.name}</span>
                        <span className="flex-shrink-0 text-gray-400 ml-2">
                          {school.fraternities.length + school.sororities.length} orgs
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Target card */}
              {target ? (
                <div
                  className={`rounded-xl border p-4 cursor-pointer hover:shadow-md transition-all ${fc.border} ${fc.bg}`}
                  onClick={() => {
                    const school = schools.find((s) => s.id === target.schoolId);
                    if (school) onSelectSchool(school);
                  }}
                >
                  <p className={`font-bold text-sm truncate ${fc.text} mb-3`}>{target.schoolName}</p>

                  {/* Progress bar */}
                  <div className="mb-1">
                    <div className="h-1.5 bg-white/80 rounded-full overflow-hidden mb-1.5">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: fc.accent }}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">
                        {progress.contacted}/{progress.total} contacted
                      </span>
                      <span className="text-xs font-bold" style={{ color: fc.accent }}>{pct}%</span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onTargetChange(founder, null);
                    }}
                    className="mt-2 text-[10px] text-gray-400 hover:text-red-400 transition-colors"
                  >
                    Clear target
                  </button>
                </div>
              ) : (
                <div
                  className="border-2 border-dashed border-gray-200 rounded-xl p-5 text-center cursor-pointer hover:border-[#C4874A]/40 hover:bg-amber-50/30 transition-all"
                  onClick={() => { setEditingFounder(founder); setSearchQuery(''); }}
                >
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-2">
                    <MapPin size={14} className="text-gray-300" />
                  </div>
                  <p className="text-xs font-medium text-gray-400">No target set</p>
                  <p className="text-[10px] text-gray-300 mt-0.5">Click to assign a school</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Chapter Section ────────────────────────────────────────────────────────
function ChapterSection({
  label,
  orgs,
  type,
  outreachLog,
  onLogContact,
  onViewDeal,
}: {
  label: string;
  orgs: OrgEntry[];
  type: 'fraternity' | 'sorority';
  outreachLog: OutreachLog;
  onLogContact: (org: OrgEntry, type: 'fraternity' | 'sorority') => void;
  onViewDeal: (org: OrgEntry) => void;
}) {
  const contactedCount = orgs.filter((o) => {
    const e = outreachLog[o.id];
    return e && e.status !== 'not_contacted';
  }).length;

  const labelColor = type === 'fraternity' ? '#1d4ed8' : '#be185d';
  const labelBg   = type === 'fraternity' ? '#eff6ff' : '#fdf2f8';

  return (
    <div>
      {/* Section label */}
      <div className="flex items-center gap-3 px-5 py-3 bg-gray-50/70 border-b border-gray-100">
        <span
          className="text-xs font-bold uppercase tracking-widest px-2.5 py-1 rounded-md"
          style={{ color: labelColor, backgroundColor: labelBg }}
        >
          {label}
        </span>
        <span className="text-xs text-gray-400">
          {contactedCount}/{orgs.length} contacted
        </span>
        {contactedCount === orgs.length && orgs.length > 0 && (
          <span className="text-xs text-green-600 font-semibold">✓ All done!</span>
        )}
      </div>

      {orgs.length === 0 ? (
        <div className="px-5 py-6 text-center">
          <p className="text-xs text-gray-400">No {label.toLowerCase()} linked yet</p>
        </div>
      ) : (
        <div>
          {orgs.map((org) => (
            <ChapterRow
              key={org.id}
              org={org}
              type={type}
              outreachEntry={outreachLog[org.id]}
              onLogContact={onLogContact}
              onViewDeal={onViewDeal}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function ClientMapCommandCenter() {
  const [schools, setSchools] = useState<School[]>([]);
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [loading, setLoading] = useState(true);

  // School selection
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [schoolSearch, setSchoolSearch] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Drawers
  const [logContactOrg, setLogContactOrg] = useState<{ org: OrgEntry; type: 'fraternity' | 'sorority' } | null>(null);
  const [viewDealOrg, setViewDealOrg] = useState<OrgEntry | null>(null);
  const [showImport, setShowImport] = useState(false);

  // Outreach log (localStorage)
  const [outreachLog, setOutreachLog] = useState<OutreachLog>({});

  // Founder targets (localStorage)
  const [founderTargets, setFounderTargets] = useState<FounderTargetsMap>({});

  // Load data
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/client-map/command-center');
      const data = await res.json();
      setSchools(data.schools ?? []);
      setKpis(data.kpis ?? null);
      if (selectedSchool) {
        const updated = (data.schools ?? []).find((s: School) => s.id === selectedSchool.id);
        if (updated) setSelectedSchool(updated);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [selectedSchool]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load localStorage
  useEffect(() => {
    try {
      const log = localStorage.getItem('chapter_outreach_log');
      if (log) setOutreachLog(JSON.parse(log));
    } catch {}
    try {
      const targets = localStorage.getItem('founder_targets_v2');
      if (targets) setFounderTargets(JSON.parse(targets));
    } catch {}
  }, []);

  // Persist outreach log
  const saveOutreachLog = useCallback((log: OutreachLog) => {
    setOutreachLog(log);
    try { localStorage.setItem('chapter_outreach_log', JSON.stringify(log)); } catch {}
  }, []);

  // Persist founder targets
  const saveFounderTargets = useCallback((targets: FounderTargetsMap) => {
    setFounderTargets(targets);
    try { localStorage.setItem('founder_targets_v2', JSON.stringify(targets)); } catch {}
  }, []);

  // School search results
  const searchResults = useMemo(() => {
    if (!schoolSearch.trim()) return schools.slice(0, 8);
    const q = schoolSearch.toLowerCase();
    return schools.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 10);
  }, [schools, schoolSearch]);

  // KPI: chapters contacted today
  const chaptersContactedToday = useMemo(() => {
    const today = todayISO();
    return Object.values(outreachLog).filter((e) => e.contactedAt?.startsWith(today)).length;
  }, [outreachLog]);

  // Close search on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSearchResults(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // Handle log contact saved
  function handleOutreachSaved(orgId: string, entry: OutreachEntry) {
    const next = { ...outreachLog, [orgId]: entry };
    saveOutreachLog(next);
  }

  // Handle founder target change
  function handleFounderTargetChange(founder: Founder, target: FounderTarget | null) {
    const next = { ...founderTargets, [founder]: target };
    saveFounderTargets(next);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#FAFAF8]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#C4874A] mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading command center...</p>
        </div>
      </div>
    );
  }

  const totalChaptersInSchool = selectedSchool
    ? selectedSchool.fraternities.length + selectedSchool.sororities.length
    : 0;
  const contactedInSchool = selectedSchool
    ? [...selectedSchool.fraternities, ...selectedSchool.sororities].filter((o) => {
        const e = outreachLog[o.id];
        return e && e.status !== 'not_contacted';
      }).length
    : 0;

  return (
    <div className="min-h-screen bg-[#FAFAF8]">

      {/* ── Module Header ──────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-6 shadow-sm">
        <div className="max-w-[1400px] mx-auto">
          {/* Top row: title + refresh */}
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: '#C4874A18' }}
              >
                <Target size={20} style={{ color: '#C4874A' }} />
              </div>
              <div>
                <h1
                  className="text-2xl text-[#1B2A4A] leading-tight"
                  style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400 }}
                >
                  School Outreach Command Center
                </h1>
                <p className="text-sm text-gray-400 mt-0.5 font-medium">
                  Daily Tactics &middot; Blast every chapter in 30 minutes
                </p>
              </div>
            </div>
            <button
              onClick={load}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-2 bg-white hover:bg-gray-50 transition-colors flex-shrink-0 mt-1"
            >
              <RefreshCw size={13} />
              Refresh
            </button>
          </div>

          {/* KPI chips row */}
          <div className="flex flex-wrap gap-3">
            <KpiChip
              icon={<Users size={14} />}
              label="Active Chapters"
              value={String(kpis?.totalActiveChapters ?? 0)}
              color="#059669"
            />
            <KpiChip
              icon={<Building2 size={14} />}
              label="In Pipeline Schools"
              value={String(kpis?.schoolsInPipeline ?? 0)}
              color="#1B2A4A"
            />
            <KpiChip
              icon={<DollarSign size={14} />}
              label="Pipeline Value"
              value={fmt$(kpis?.totalPipelineValue ?? 0)}
              color="#7c3aed"
            />
            <KpiChip
              icon={<Zap size={14} />}
              label="Contacted Today"
              value={String(chaptersContactedToday)}
              color="#C4874A"
            />
            <KpiChip
              icon={<TrendingUp size={14} />}
              label="States Covered"
              value={String(kpis?.statesCovered ?? 0)}
              color="#0ea5e9"
            />
          </div>
        </div>
      </div>

      <div className="px-6 py-6 space-y-6 max-w-[1400px] mx-auto">

        {/* ── Founder Target Board ─────────────────────────────────────────── */}
        <FounderTargetBoard
          schools={schools}
          outreachLog={outreachLog}
          founderTargets={founderTargets}
          onTargetChange={handleFounderTargetChange}
          onSelectSchool={(school) => {
            setSelectedSchool(school);
            setSchoolSearch('');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />

        {/* ── School Search ────────────────────────────────────────────────── */}
        <div ref={searchContainerRef} className="relative">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-5">
            {/* Search input */}
            <div className="relative">
              <Search
                size={20}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search for a school to launch outbound..."
                value={schoolSearch}
                onChange={(e) => {
                  setSchoolSearch(e.target.value);
                  setShowSearchResults(true);
                }}
                onFocus={() => setShowSearchResults(true)}
                className="w-full pl-12 pr-12 py-4 text-base border-2 border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-4 focus:ring-[#C4874A]/10 focus:border-[#C4874A]/50 transition-all font-medium placeholder:font-normal placeholder:text-gray-400"
              />
              {schoolSearch && (
                <button
                  onClick={() => { setSchoolSearch(''); setShowSearchResults(false); }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Selected school badge */}
            {selectedSchool && !showSearchResults && (
              <div className="flex items-center gap-2 mt-3">
                <div className="flex items-center gap-2 bg-[#1B2A4A]/5 border border-[#1B2A4A]/15 rounded-lg px-3 py-2 flex-1 min-w-0">
                  <Building2 size={13} className="text-[#1B2A4A] flex-shrink-0" />
                  <span className="font-semibold text-[#1B2A4A] text-sm truncate">{selectedSchool.name}</span>
                  {selectedSchool.conference && (
                    <span className="text-xs text-gray-400 flex-shrink-0">{selectedSchool.conference}</span>
                  )}
                  <span className="text-xs text-gray-400 flex-shrink-0">·</span>
                  <span className="text-xs text-gray-400 flex-shrink-0">{totalChaptersInSchool} chapters</span>
                </div>
                <button
                  onClick={() => { setSelectedSchool(null); setSchoolSearch(''); }}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X size={15} />
                </button>
              </div>
            )}
          </div>

          {/* Search dropdown */}
          {showSearchResults && (
            <div className="absolute z-30 top-full mt-2 left-0 right-0 bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden">
              {searchResults.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Search size={24} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No schools found</p>
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto">
                  {searchResults.map((school) => (
                    <button
                      key={school.id}
                      onClick={() => {
                        setSelectedSchool(school);
                        setSchoolSearch('');
                        setShowSearchResults(false);
                      }}
                      className="w-full text-left px-4 py-3.5 hover:bg-[#FAFAF8] transition-colors flex items-center justify-between border-b border-gray-50 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-[#1B2A4A] text-sm truncate">{school.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {school.state}
                          {school.conference ? ` · ${school.conference}` : ''}
                          {' · '}
                          {school.fraternities.length + school.sororities.length} chapters
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                        {school.status === 'active_client' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100 font-semibold">Active</span>
                        )}
                        {school.status === 'in_pipeline' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100 font-semibold">Pipeline</span>
                        )}
                        {school.dealCount > 0 && (
                          <span className="text-xs text-gray-400">{school.dealCount} deals</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Chapter Panel ────────────────────────────────────────────────── */}
        {selectedSchool ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Panel header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2
                    className="font-semibold text-[#1B2A4A] text-lg truncate"
                    style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}
                  >
                    {selectedSchool.name}
                  </h2>
                  {selectedSchool.conference && (
                    <span className="text-xs px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 font-medium flex-shrink-0">
                      {selectedSchool.conference}
                    </span>
                  )}
                  {selectedSchool.status === 'active_client' && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100 font-semibold flex-shrink-0">Active Client</span>
                  )}
                  {selectedSchool.status === 'in_pipeline' && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100 font-semibold flex-shrink-0">In Pipeline</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {totalChaptersInSchool} chapters · {contactedInSchool}/{totalChaptersInSchool} contacted
                  {totalChaptersInSchool > 0 && (
                    <span className="ml-2 font-semibold text-[#C4874A]">
                      {Math.round((contactedInSchool / totalChaptersInSchool) * 100)}% complete
                    </span>
                  )}
                </p>
              </div>
              {/* Import button */}
              <button
                onClick={() => setShowImport(true)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors flex-shrink-0"
              >
                <Upload size={13} />
                Import Chapters
              </button>
            </div>

            {/* Column headers */}
            {totalChaptersInSchool > 0 && (
              <div className="hidden md:flex items-center gap-3 px-5 py-2 bg-gray-50 border-b border-gray-100 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                <span className="flex-1">Chapter</span>
                <span className="w-28 flex-shrink-0">Status</span>
                <span className="w-16 flex-shrink-0">Method</span>
                <span className="w-28 flex-shrink-0 hidden md:block">Contact</span>
                <span className="w-16 flex-shrink-0 hidden lg:block">Date</span>
                <span className="w-36 flex-shrink-0">Actions</span>
              </div>
            )}

            {totalChaptersInSchool === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center mb-4">
                  <Building2 size={26} className="text-gray-300" />
                </div>
                <p className="text-sm font-semibold text-gray-500">No chapters linked yet</p>
                <p className="text-xs mt-1 text-gray-400">Use Import to add chapters to this school</p>
                <button
                  onClick={() => setShowImport(true)}
                  className="mt-4 flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl bg-[#1B2A4A] text-white hover:bg-[#243560] transition-colors"
                >
                  <Upload size={14} />
                  Import Chapters
                </button>
              </div>
            ) : (
              <div>
                {/* Fraternities */}
                <ChapterSection
                  label="Fraternities"
                  orgs={selectedSchool.fraternities}
                  type="fraternity"
                  outreachLog={outreachLog}
                  onLogContact={(o, t) => setLogContactOrg({ org: o, type: t })}
                  onViewDeal={(o) => setViewDealOrg(o)}
                />
                {/* Sororities */}
                <ChapterSection
                  label="Sororities"
                  orgs={selectedSchool.sororities}
                  type="sorority"
                  outreachLog={outreachLog}
                  onLogContact={(o, t) => setLogContactOrg({ org: o, type: t })}
                  onViewDeal={(o) => setViewDealOrg(o)}
                />
              </div>
            )}
          </div>
        ) : (
          /* Empty state */
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col items-center justify-center py-24">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
              style={{ backgroundColor: '#C4874A12', border: '1.5px solid #C4874A30' }}
            >
              <Target size={30} style={{ color: '#C4874A' }} />
            </div>
            <p className="text-lg font-semibold text-[#1B2A4A]" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
              Select a school to see all chapters
            </p>
            <p className="text-sm mt-2 text-gray-400 max-w-xs text-center leading-relaxed">
              Pick a school, then contact every frat and sorority in 30–45 minutes
            </p>
          </div>
        )}
      </div>

      {/* ── Drawers & Modals ─────────────────────────────────────────────────── */}
      {logContactOrg && selectedSchool && (
        <LogContactDrawer
          org={logContactOrg.org}
          orgType={logContactOrg.type}
          schoolId={selectedSchool.id}
          schoolName={selectedSchool.name}
          onClose={() => setLogContactOrg(null)}
          onSaved={handleOutreachSaved}
        />
      )}

      {viewDealOrg && (
        <ViewDealDrawer
          org={viewDealOrg}
          onClose={() => setViewDealOrg(null)}
          onSaved={load}
        />
      )}

      {showImport && selectedSchool && (
        <ImportChaptersModal
          school={selectedSchool}
          existingOrgs={[...selectedSchool.fraternities, ...selectedSchool.sororities]}
          onClose={() => setShowImport(false)}
          onImported={load}
        />
      )}
    </div>
  );
}
