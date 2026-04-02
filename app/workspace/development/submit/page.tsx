'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles, ChevronLeft, CheckCircle2, AlertCircle } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Spec {
  title: string;
  description: string;
  acceptance_criteria: string[];
  edge_cases: string[];
  complexity: 'Small' | 'Medium' | 'Large';
}

interface Project {
  id: string;
  name: string;
  status: string;
}

interface QueueTicket {
  id: string;
  number: number;
  title: string;
  priority: string;
  ticket_type: string;
  status: string;
}

const AUTH = 'Bearer hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h';

const COMPLEXITY_COLOR = {
  Small: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  Medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Large: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const PRIORITY_ORDER = ['high', 'medium', 'low'];
const PRIORITY_LABEL_COLOR: Record<string, string> = {
  high: 'text-red-400 bg-red-500/15',
  medium: 'text-amber-400 bg-amber-500/15',
  low: 'text-slate-400 bg-white/5',
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SubmitRequestPage() {
  const router = useRouter();

  // Form state
  const [description, setDescription] = useState('');
  const [spec, setSpec] = useState<Spec | null>(null);
  const [generatingSpec, setGeneratingSpec] = useState(false);
  const [specError, setSpecError] = useState<string | null>(null);

  const [ticketType, setTicketType] = useState<'ios' | 'web'>('web');
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [projectId, setProjectId] = useState('');

  const [projects, setProjects] = useState<Project[]>([]);
  const [queue, setQueue] = useState<QueueTicket[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load projects and queue
  useEffect(() => {
    fetch('/api/projects').then(r => r.json()).then(j => {
      if (j.data) setProjects(j.data.filter((p: Project) => p.status !== 'archived'));
    }).catch(() => {});

    fetch('/api/tickets?status=active', {
      headers: { Authorization: AUTH },
    }).then(r => r.json()).then(j => {
      if (j.data) setQueue(j.data as QueueTicket[]);
    }).catch(() => {});
  }, []);

  // Queue preview: show tickets matching current priority + type, plus where this new one would land
  const filteredQueue = queue
    .filter(t => t.ticket_type === ticketType || !t.ticket_type)
    .sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority))
    .slice(0, 8);

  const generateSpec = useCallback(async () => {
    if (!description.trim()) return;
    setGeneratingSpec(true);
    setSpecError(null);
    setSpec(null);
    try {
      const res = await fetch('/api/development/generate-spec', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: AUTH,
        },
        body: JSON.stringify({ description }),
      });
      const data = await res.json() as { spec?: Spec; error?: string };
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to generate spec');
      if (data.spec) setSpec(data.spec);
    } catch (e) {
      setSpecError(e instanceof Error ? e.message : 'Failed to generate spec');
    } finally {
      setGeneratingSpec(false);
    }
  }, [description]);

  const handleSubmit = async () => {
    if (!spec) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Create the ticket
      const ticketRes = await fetch('/api/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: AUTH,
        },
        body: JSON.stringify({
          title: spec.title,
          description: `${spec.description}\n\n**Acceptance Criteria:**\n${spec.acceptance_criteria.map(c => `- ${c}`).join('\n')}\n\n**Edge Cases:**\n${spec.edge_cases.map(e => `- ${e}`).join('\n')}`,
          type: 'feature_request',
          priority,
          status: 'backlog',
          project_id: projectId || null,
          // ticket_type and spec columns are added by a future migration — omitted for now
        }),
      });

      const ticketData = await ticketRes.json() as { data?: { id: string }; error?: { message?: string } };
      if (!ticketRes.ok || ticketData.error) {
        throw new Error(ticketData.error?.message || 'Failed to create ticket');
      }

      const ticketId = ticketData.data?.id;

      // If web, optionally create a Linear issue
      if (ticketType === 'web' && ticketId) {
        try {
          const linearPriority = priority === 'high' ? 2 : priority === 'medium' ? 3 : 4;
          const linearRes = await fetch('/api/linear/issues', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: AUTH,
            },
            body: JSON.stringify({
              title: spec.title,
              description: spec.description,
              priority: linearPriority,
            }),
          });
          const linearData = await linearRes.json() as { data?: { id: string; identifier: string } };
          if (linearData.data?.identifier) {
            // linear_id column is added by a future migration — skip patching for now
            console.log('Linear issue created:', linearData.data.identifier);
          }
        } catch {
          // Linear creation is best-effort
          console.warn('Linear issue creation failed — continuing');
        }
      }

      setSubmitted(true);

      // Fire review notification (non-blocking)
      try {
        void fetch('/api/notifications/review-assigned', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketId: ticketId ?? '',
            ticketTitle: spec.title,
            priority,
            ticketType,
          }),
        });
      } catch {
        // notification failure must not block ticket creation
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to submit ticket');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-xl mx-auto py-20 flex flex-col items-center text-center gap-4">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-2"
          style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(16,185,129,0.1) 100%)', border: '1.5px solid rgba(16,185,129,0.3)' }}>
          <CheckCircle2 size={32} className="text-emerald-400" strokeWidth={1.5} />
        </div>
        <h2 className="text-2xl font-bold text-white">Ticket Submitted!</h2>
        <p className="text-slate-400">Your ticket has been created and added to the backlog.</p>
        <div className="flex gap-3 mt-4">
          <button
            onClick={() => { setSubmitted(false); setSpec(null); setDescription(''); }}
            className="px-4 py-2 text-sm border border-white/10 rounded-lg hover:bg-white/5 transition-colors text-slate-300"
          >
            Submit Another
          </button>
          <button
            onClick={() => router.push('/workspace/development')}
            className="px-4 py-2 text-sm font-semibold rounded-lg transition-all hover:scale-105"
            style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}
          >
            View Development Board
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="relative flex items-center gap-3">
        {/* Ambient gradient */}
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute top-0 left-0 w-72 h-16 bg-violet-500/8 blur-2xl rounded-full" />
        </div>
        <button
          onClick={() => router.push('/workspace/development')}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
        >
          <ChevronLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">Product Review</h1>
          <p className="text-sm text-slate-400">Submit a feature, bug, or improvement for review</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Form */}
        <div className="lg:col-span-2 space-y-5">

          {/* Step 1: Description */}
          <div className="rounded-xl p-5 space-y-3 border"
            style={{
              background: 'linear-gradient(180deg, rgba(15,23,42,0.9) 0%, rgba(15,23,42,0.8) 100%)',
              borderColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <label className="block text-sm font-semibold text-slate-200">
              What do you want built?
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe the feature, bug fix, or improvement..."
              rows={5}
              className="w-full px-3 py-2.5 text-sm rounded-lg resize-none focus:outline-none transition-colors placeholder:text-slate-600 text-slate-200"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)'; }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
            />
            <button
              onClick={generateSpec}
              disabled={!description.trim() || generatingSpec}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 shadow-lg hover:shadow-indigo-500/20"
              style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}
            >
              {generatingSpec ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              {generatingSpec ? 'Generating Spec…' : 'Generate Spec'}
            </button>
            {specError && (
              <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-lg border border-red-500/20">
                <AlertCircle size={14} />
                {specError}
              </div>
            )}
          </div>

          {/* Step 2: Spec Preview */}
          {spec && (
            <div className="rounded-xl p-5 space-y-4 border"
              style={{
                background: 'linear-gradient(180deg, rgba(99,102,241,0.08) 0%, rgba(15,23,42,0.9) 100%)',
                borderColor: 'rgba(99,102,241,0.25)',
                boxShadow: '0 0 20px rgba(99,102,241,0.08)',
              }}
            >
              {/* Header label + Regenerate */}
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/8">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-indigo-400 shrink-0" />
                  <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wide">
                    Generated Spec — review before submitting
                  </span>
                </div>
                <button
                  onClick={generateSpec}
                  disabled={generatingSpec || !description.trim()}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-indigo-400 border border-indigo-500/30 rounded-lg hover:bg-indigo-500/10 transition-colors disabled:opacity-40"
                >
                  {generatingSpec ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <Sparkles size={11} />
                  )}
                  Regenerate
                </button>
              </div>

              {/* Title + complexity badge */}
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-bold text-white leading-snug">{spec.title}</h3>
                <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border shrink-0 ${COMPLEXITY_COLOR[spec.complexity]}`}>
                  {spec.complexity}
                </span>
              </div>

              {/* Description */}
              <p className="text-sm text-slate-400 leading-relaxed">{spec.description}</p>

              {/* Acceptance Criteria */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Acceptance Criteria</p>
                <ul className="space-y-1.5">
                  {spec.acceptance_criteria.map((criterion, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                      <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                      {criterion}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Edge Cases */}
              {spec.edge_cases.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Edge Cases</p>
                  <ul className="space-y-1.5">
                    {spec.edge_cases.map((ec, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-400">
                        <AlertCircle size={14} className="text-amber-400 mt-0.5 shrink-0" />
                        {ec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Metadata */}
          <div className="rounded-xl p-5 space-y-4 border"
            style={{
              background: 'linear-gradient(180deg, rgba(15,23,42,0.9) 0%, rgba(15,23,42,0.8) 100%)',
              borderColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <h3 className="text-sm font-semibold text-slate-200">Ticket Details</h3>

            {/* Type */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Type</label>
              <div className="flex gap-3">
                {(['web', 'ios'] as const).map(t => (
                  <label key={t} className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors ${
                    ticketType === t
                      ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-300'
                      : 'border-white/8 text-slate-500 hover:border-white/15 hover:text-slate-300'
                  }`}>
                    <input
                      type="radio"
                      name="ticket_type"
                      value={t}
                      checked={ticketType === t}
                      onChange={() => setTicketType(t)}
                      className="sr-only"
                    />
                    <span className="text-sm font-medium capitalize">{t === 'ios' ? 'iOS' : 'Web'}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Priority</label>
              <div className="flex gap-3">
                {(['high', 'medium', 'low'] as const).map(p => (
                  <label key={p} className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors ${
                    priority === p
                      ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-300'
                      : 'border-white/8 text-slate-500 hover:border-white/15 hover:text-slate-300'
                  }`}>
                    <input
                      type="radio"
                      name="priority"
                      value={p}
                      checked={priority === p}
                      onChange={() => setPriority(p)}
                      className="sr-only"
                    />
                    <span className="text-sm font-medium capitalize">{p}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Project */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Project</label>
              <select
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none transition-colors text-slate-200"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <option value="" className="bg-slate-900">No project</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id} className="bg-slate-900">{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Submit */}
          {submitError && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 px-4 py-3 rounded-lg border border-red-500/20">
              <AlertCircle size={14} />
              {submitError}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!spec || submitting}
            className="w-full py-3 text-sm font-bold rounded-xl transition-all hover:scale-[1.01] disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2 shadow-lg hover:shadow-indigo-500/20"
            style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
            {submitting ? 'Submitting…' : 'Submit Ticket'}
          </button>
        </div>

        {/* Right column: Queue preview */}
        <div className="space-y-4">
          <div className="rounded-xl p-4 border"
            style={{
              background: 'linear-gradient(180deg, rgba(15,23,42,0.9) 0%, rgba(15,23,42,0.8) 100%)',
              borderColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <h3 className="text-sm font-semibold text-slate-200 mb-3">Current Queue</h3>
            <p className="text-xs text-slate-500 mb-3">
              {ticketType === 'ios' ? 'iOS' : 'Web'} · {priority} priority
            </p>

            {filteredQueue.length === 0 ? (
              <p className="text-xs text-slate-600 italic">No active tickets — yours goes first!</p>
            ) : (
              <div className="space-y-2">
                {/* Show where new ticket would land */}
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border"
                  style={{ background: 'rgba(99,102,241,0.1)', borderColor: 'rgba(99,102,241,0.25)' }}>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${PRIORITY_LABEL_COLOR[priority]}`}>
                    {priority}
                  </span>
                  <span className="text-xs text-indigo-300 font-medium truncate">
                    {spec?.title || 'Your new ticket'}
                  </span>
                  <span className="ml-auto text-[10px] text-indigo-500 shrink-0">← new</span>
                </div>

                {filteredQueue.map(t => (
                  <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${PRIORITY_LABEL_COLOR[t.priority] || 'text-slate-500 bg-white/5'}`}>
                      {t.priority}
                    </span>
                    <span className="text-xs text-slate-500 truncate">#{t.number} {t.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl p-4 border"
            style={{
              background: 'linear-gradient(180deg, rgba(99,102,241,0.06) 0%, rgba(15,23,42,0.8) 100%)',
              borderColor: 'rgba(99,102,241,0.15)',
            }}
          >
            <p className="text-xs font-semibold text-slate-300 mb-1.5">What happens next?</p>
            <p className="text-xs text-slate-500 leading-relaxed">Your ticket goes into the backlog and gets assigned for review. Web tickets also create a Linear issue. Once Devin builds it, Owen, Adam, or Ford will be assigned to test before it goes to production.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
