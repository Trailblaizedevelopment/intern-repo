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

const AUTH = 'hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h';

const COMPLEXITY_COLOR = {
  Small: 'bg-green-100 text-green-700 border-green-200',
  Medium: 'bg-amber-100 text-amber-700 border-amber-200',
  Large: 'bg-red-100 text-red-700 border-red-200',
};

const PRIORITY_ORDER = ['high', 'medium', 'low'];
const PRIORITY_LABEL_COLOR: Record<string, string> = {
  high: 'text-red-600 bg-red-50',
  medium: 'text-amber-600 bg-amber-50',
  low: 'text-gray-500 bg-gray-50',
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
          ticket_type: ticketType,
          spec: JSON.stringify(spec),
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
            // Patch ticket with Linear ID
            await fetch(`/api/tickets/${ticketId}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                Authorization: AUTH,
              },
              body: JSON.stringify({ linear_id: linearData.data.identifier }),
            });
          }
        } catch {
          // Linear creation is best-effort
          console.warn('Linear issue creation failed — continuing');
        }
      }

      setSubmitted(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to submit ticket');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-xl mx-auto py-20 flex flex-col items-center text-center gap-4">
        <CheckCircle2 size={56} className="text-green-500" strokeWidth={1.5} />
        <h2 className="text-2xl font-bold text-gray-900">Request Submitted!</h2>
        <p className="text-gray-500">Your ticket has been created and added to the backlog.</p>
        <div className="flex gap-3 mt-4">
          <button
            onClick={() => { setSubmitted(false); setSpec(null); setDescription(''); }}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Submit Another
          </button>
          <button
            onClick={() => router.push('/workspace/development')}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
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
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/workspace/development')}
          className="p-1.5 rounded hover:bg-gray-100 transition-colors text-gray-500"
        >
          <ChevronLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Submit a Request</h1>
          <p className="text-sm text-gray-500">Describe what you want built and we&apos;ll generate a spec</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Form */}
        <div className="lg:col-span-2 space-y-5">

          {/* Step 1: Description */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
            <label className="block text-sm font-semibold text-gray-800">
              What do you want built?
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe the feature, bug fix, or improvement..."
              rows={5}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:border-blue-400 transition-colors"
            />
            <button
              onClick={generateSpec}
              disabled={!description.trim() || generatingSpec}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {generatingSpec ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              {generatingSpec ? 'Generating Spec…' : 'Generate Spec'}
            </button>
            {specError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                <AlertCircle size={14} />
                {specError}
              </div>
            )}
          </div>

          {/* Step 2: Spec Preview */}
          {spec && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-gray-900">{spec.title}</h3>
                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${COMPLEXITY_COLOR[spec.complexity]}`}>
                  {spec.complexity}
                </span>
              </div>

              <p className="text-sm text-gray-600 leading-relaxed">{spec.description}</p>

              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Acceptance Criteria</p>
                <ul className="space-y-1">
                  {spec.acceptance_criteria.map((criterion, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <CheckCircle2 size={14} className="text-green-500 mt-0.5 shrink-0" />
                      {criterion}
                    </li>
                  ))}
                </ul>
              </div>

              {spec.edge_cases.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Edge Cases</p>
                  <ul className="space-y-1">
                    {spec.edge_cases.map((ec, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
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
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">Ticket Details</h3>

            {/* Type */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Type</label>
              <div className="flex gap-3">
                {(['web', 'ios'] as const).map(t => (
                  <label key={t} className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors ${
                    ticketType === t
                      ? 'border-blue-400 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
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
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Priority</label>
              <div className="flex gap-3">
                {(['high', 'medium', 'low'] as const).map(p => (
                  <label key={p} className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors ${
                    priority === p
                      ? 'border-blue-400 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
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
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Project</label>
              <select
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400 transition-colors"
              >
                <option value="">No project</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Submit */}
          {submitError && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg border border-red-200">
              <AlertCircle size={14} />
              {submitError}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!spec || submitting}
            className="w-full py-3 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
            {submitting ? 'Submitting…' : 'Submit Ticket'}
          </button>
        </div>

        {/* Right column: Queue preview */}
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Current Queue</h3>
            <p className="text-xs text-gray-400 mb-3">
              {ticketType === 'ios' ? 'iOS' : 'Web'} · {priority} priority
            </p>

            {filteredQueue.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No active tickets — yours goes first!</p>
            ) : (
              <div className="space-y-2">
                {/* Show where new ticket would land */}
                <div className="flex items-center gap-2 px-2 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${PRIORITY_LABEL_COLOR[priority]}`}>
                    {priority}
                  </span>
                  <span className="text-xs text-blue-700 font-medium truncate">
                    {spec?.title || 'Your new ticket'}
                  </span>
                  <span className="ml-auto text-[10px] text-blue-500 shrink-0">← new</span>
                </div>

                {filteredQueue.map(t => (
                  <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${PRIORITY_LABEL_COLOR[t.priority] || 'text-gray-400 bg-gray-50'}`}>
                      {t.priority}
                    </span>
                    <span className="text-xs text-gray-600 truncate">#{t.number} {t.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-500 leading-relaxed">
            <p className="font-semibold text-gray-600 mb-1">What happens next?</p>
            <p>Your ticket goes into the backlog. Web tickets also create a Linear issue for the engineering team. Devin will pick it up in the next sprint.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
