'use client';

import React, { useState } from 'react';
import {
  BookOpen,
  MessageSquare,
  Plug,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { automationDisplayName, formatAutomationSchedule } from '@/lib/brain/automation-schedule';

interface ConnectorStatus {
  id: string;
  label: string;
  available: boolean;
  toolCount: number;
}

interface AutomationRow {
  id: string;
  name: string;
  kind: string;
  schedule: string | null;
  enabled: boolean;
  config: Record<string, unknown>;
}

interface GuideViewProps {
  connectors: ConnectorStatus[];
  automations: AutomationRow[];
  linearReadOnly: boolean;
  rateLimits?: { per_minute: number; per_hour: number };
}

type GuideSection = 'start' | 'setup' | 'capabilities' | 'glossary';

const SECTIONS: { id: GuideSection; label: string; icon: React.ElementType }[] = [
  { id: 'start', label: 'Quick start', icon: MessageSquare },
  { id: 'setup', label: 'What is set up', icon: Plug },
  { id: 'capabilities', label: 'What Brain can do', icon: Sparkles },
  { id: 'glossary', label: 'Terminology', icon: BookOpen },
];

const CAPABILITIES = [
  {
    area: 'Linear (tickets)',
    items: [
      'Search and list issues by team, assignee, status, or due date',
      'Read issue details, comments, and priorities',
      'Create or update issues when write mode is enabled',
      'Reference tickets by id (e.g. TRA-876)',
    ],
  },
  {
    area: 'GitHub (Trailblaize-Web)',
    items: [
      'List open pull requests and inspect a specific PR',
      'Search code across the repo (“where is X implemented?”)',
      'Read file contents on develop',
      'List recent commits in a time window',
    ],
  },
  {
    area: 'Cursor (implementation)',
    items: [
      'Dispatch a cloud agent to implement code on an integration feature branch',
      'Poll agent status and open PRs',
      'Follow-up dispatches after PR merges into the integration branch',
      'Never targets develop or main directly — humans merge',
    ],
  },
  {
    area: 'Task orchestration',
    items: [
      'Start durable multi-step goals (“work on this for an hour”)',
      'Background runner loops until complete, blocked, or deadline',
      'Grill planning step before execution',
      'Slack updates on status changes and PR links',
    ],
  },
  {
    area: 'Slack (primary interface)',
    items: [
      '@mention the bot or reply in a thread',
      'Conversation history persists per thread',
      'Rate limits apply per user',
      'Dev Console is read-only monitoring — not chat',
    ],
  },
];

const GLOSSARY: { term: string; definition: string }[] = [
  { term: 'Agent run', definition: 'One Brain invocation — a single Slack message (or task iteration) processed through the LLM. Tracked in Ops with tokens, latency, and cost.' },
  { term: 'Brain task / orchestration task', definition: 'A durable goal stored in brain_tasks. The cron runner picks it up, plans, dispatches Cursor, polls PRs, and loops until done or blocked.' },
  { term: 'Tool call', definition: 'A connector action (Linear, GitHub, Cursor, tasks) executed during an agent run. Logged in the tool audit trail.' },
  { term: 'Connector', definition: 'An integration module exposing tools to Brain — linear, github, cursor, tasks.' },
  { term: 'Integration branch', definition: 'Feature branch (feature/TRA-xxx-…) where Cursor opens PRs. Humans merge to develop after review.' },
  { term: 'Grill', definition: 'Planning pass that generates an execution plan before a brain task enters the queue.' },
  { term: 'Surface', definition: 'Where a run originated: slack (chat), workspace (legacy), or task (orchestration iteration).' },
  { term: 'Automation', definition: 'Cron-driven job registered in brain_automations (e.g. morning briefing to Slack).' },
  { term: 'Action log', definition: 'Audit trail of every tool invocation with input/output snapshots (secrets redacted).' },
  { term: 'Write mode', definition: 'When BRAIN_LINEAR_READ_ONLY=false, Brain may create/update Linear issues. Otherwise read-only.' },
  { term: 'Awaiting approval', definition: 'Task paused until you approve a Cursor dispatch in Slack.' },
];

export function GuideView({ connectors, automations, linearReadOnly, rateLimits }: GuideViewProps) {
  const [section, setSection] = useState<GuideSection>('start');

  return (
    <div className="dev-console-guide" style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, alignItems: 'start' }}>
      {/* Nav */}
      <nav className="dev-console-guide-nav" style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: 8, position: 'sticky', top: 12 }}>
        <p className="dev-console-guide-nav-label" style={{ margin: '4px 10px 10px', fontSize: '0.6875rem', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          User manual
        </p>
        {SECTIONS.map(s => {
          const Icon = s.icon;
          const active = section === s.id;
          return (
            <button
              key={s.id}
              type="button"
              data-active={active ? 'true' : undefined}
              onClick={() => setSection(s.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: active ? '#EEF2FF' : 'transparent',
                color: active ? '#4338CA' : '#374151',
                fontSize: '0.8125rem', fontWeight: active ? 600 : 500, textAlign: 'left',
              }}
            >
              <Icon size={15} />
              {s.label}
            </button>
          );
        })}
      </nav>

      {/* Content */}
      <article className="dev-console-guide-article" style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '24px 28px', minHeight: 420 }}>
        {section === 'start' && <QuickStart rateLimits={rateLimits} />}
        {section === 'setup' && (
          <SetupSection connectors={connectors} automations={automations} linearReadOnly={linearReadOnly} rateLimits={rateLimits} />
        )}
        {section === 'capabilities' && <CapabilitiesSection linearReadOnly={linearReadOnly} />}
        {section === 'glossary' && <GlossarySection />}
      </article>
    </div>
  );
}

function QuickStart({ rateLimits }: { rateLimits?: { per_minute: number; per_hour: number } }) {
  return (
    <>
      <GuideHeading title="Quick start" subtitle="How to talk to Brain today" />
      <ol style={{ margin: '0 0 20px', paddingLeft: 20, color: '#374151', fontSize: '0.875rem', lineHeight: 1.7 }}>
        <li>Open Slack and find the Trailblaize Brain app.</li>
        <li>@mention the bot or reply in an existing thread with your question or task.</li>
        <li>Brain acks immediately, then replaces the message when done (tools may run in between).</li>
        <li>Use the <strong>Ops</strong> view here to monitor runs, spend, and orchestration.</li>
        <li>For long work, ask explicitly: “Work on TRA-465 for the next hour” — that starts a brain task.</li>
      </ol>
      <Callout icon={Terminal} title="Example prompts">
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.8125rem', lineHeight: 1.65 }}>
          <li>What tickets are due this week?</li>
          <li>List open PRs on Trailblaize-Web</li>
          <li>Create a Linear issue: … (write mode only)</li>
          <li>Search the codebase for where we handle outreach batches</li>
          <li>Start a brain task to implement TRA-878 — low priority</li>
        </ul>
      </Callout>
      {rateLimits && (
        <p style={{ marginTop: 16, fontSize: '0.75rem', color: '#6B7280' }}>
          Rate limit: {rateLimits.per_minute}/min · {rateLimits.per_hour}/hour per user.
        </p>
      )}
    </>
  );
}

function SetupSection({
  connectors,
  automations,
  linearReadOnly,
  rateLimits,
}: {
  connectors: ConnectorStatus[];
  automations: AutomationRow[];
  linearReadOnly: boolean;
  rateLimits?: { per_minute: number; per_hour: number };
}) {
  return (
    <>
      <GuideHeading title="What is set up" subtitle="Live system configuration (read-only)" />
      <h3 style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#111827', margin: '20px 0 10px' }}>Connectors</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        {connectors.map(c => (
          <div
            key={c.id}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB',
              background: c.available ? '#F9FAFB' : '#FEF2F2',
            }}
          >
            <div>
              <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#111827' }}>{c.label}</span>
              <span style={{ marginLeft: 8, fontSize: '0.6875rem', color: '#9CA3AF' }}>{c.id}</span>
            </div>
            <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: c.available ? '#059669' : '#DC2626' }}>
              {c.available ? `${c.toolCount} tools` : 'offline'}
            </span>
          </div>
        ))}
      </div>

      <h3 style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#111827', margin: '20px 0 10px' }}>Platform</h3>
      <SetupRow label="Primary chat" value="Slack (threads + @mentions)" />
      <SetupRow label="Dev Console" value="Read-only ops · Devin only" />
      <SetupRow label="Linear mode" value={linearReadOnly ? 'Read-only' : 'Write enabled'} />
      <SetupRow label="Task runner cron" value="Polls brain_tasks · dispatches Cursor · Slack notify" />
      {rateLimits && (
        <SetupRow label="Rate limits" value={`${rateLimits.per_minute}/min · ${rateLimits.per_hour}/hr`} />
      )}

      <h3 style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#111827', margin: '20px 0 10px' }}>Automations</h3>
      {automations.length === 0 ? (
        <p style={{ fontSize: '0.8125rem', color: '#9CA3AF' }}>None registered.</p>
      ) : (
        automations.map(a => (
          <div key={a.id} style={{ padding: '10px 0', borderBottom: '1px solid #F3F4F6', fontSize: '0.8125rem' }}>
            <strong>{automationDisplayName(a.name)}</strong>
            <span style={{ color: '#6B7280', marginLeft: 8 }}>
              {formatAutomationSchedule(a.schedule, a.kind, a.config)} · {a.enabled ? 'enabled' : 'disabled'}
            </span>
          </div>
        ))
      )}

      <h3 style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#111827', margin: '20px 0 10px' }}>Data stores</h3>
      <SetupRow label="brain_agent_runs" value="Per-invocation metrics (tokens, cost, latency)" />
      <SetupRow label="brain_tasks" value="Orchestration goals + Cursor state" />
      <SetupRow label="brain_action_log" value="Tool audit trail" />
      <SetupRow label="brain_conversations" value="Slack thread history" />
    </>
  );
}

function CapabilitiesSection({ linearReadOnly }: { linearReadOnly: boolean }) {
  return (
    <>
      <GuideHeading title="What Brain can do" subtitle="Capabilities by integration" />
      {linearReadOnly && (
        <Callout icon={Sparkles} title="Linear is read-only">
          Issue creates/updates are disabled. Ask Devin to enable write mode if needed.
        </Callout>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
        {CAPABILITIES.map(block => (
          <div key={block.area}>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#4338CA', margin: '0 0 8px' }}>{block.area}</h3>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.8125rem', color: '#374151', lineHeight: 1.65 }}>
              {block.items.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}

function GlossarySection() {
  return (
    <>
      <GuideHeading title="Terminology" subtitle="Ops dashboard & Brain vocabulary" />
      <div style={{ marginTop: 16 }}>
        {GLOSSARY.map((g, i) => (
          <div
            key={g.term}
            style={{
              padding: '12px 0',
              borderBottom: i < GLOSSARY.length - 1 ? '1px solid #F3F4F6' : undefined,
            }}
          >
            <dt style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#111827', marginBottom: 4 }}>{g.term}</dt>
            <dd style={{ margin: 0, fontSize: '0.8125rem', color: '#6B7280', lineHeight: 1.55 }}>{g.definition}</dd>
          </div>
        ))}
      </div>
    </>
  );
}

function GuideHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header style={{ marginBottom: 8 }}>
      <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>{title}</h2>
      <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: '#6B7280' }}>{subtitle}</p>
    </header>
  );
}

function SetupRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid #F3F4F6', fontSize: '0.8125rem' }}>
      <span style={{ color: '#6B7280', fontFamily: 'ui-monospace, monospace', fontSize: '0.75rem' }}>{label}</span>
      <span style={{ color: '#111827', fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function Callout({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '14px 16px', borderRadius: 10, background: '#EEF2FF', border: '1px solid #C7D2FE', marginTop: 12 }}>
      <Icon size={18} style={{ color: '#4338CA', flexShrink: 0, marginTop: 2 }} />
      <div>
        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#3730A3', marginBottom: 6 }}>{title}</div>
        <div style={{ color: '#4338CA' }}>{children}</div>
      </div>
    </div>
  );
}
