import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

const AGENTS = [
  { id: 'main', name: 'Tony', emoji: '🤙', description: "Chief of staff — Owen's right hand, orchestrates all agents", color: 'violet', isMain: true },
  { id: 'gtm', name: 'Blaze', emoji: '🔥', description: 'GTM co-pilot — Adam + Ford liaison, $10M plan, IFC/Nationals pipeline', color: 'amber' },
  { id: 'sales', name: 'Sales Agent', emoji: '💰', description: 'Pipeline research, lead gen, outreach drafting', color: 'emerald' },
  { id: 'alumni', name: 'Alumni Agent', emoji: '📬', description: 'Alumni outreach execution, T1/T2/T3 cadence, response monitoring', color: 'blue' },
  { id: 'success', name: 'Success Agent', emoji: '🚀', description: 'Chapter health, onboarding, CS operations', color: 'teal' },
  { id: 'dev', name: 'Forge', emoji: '⚒️', description: 'Lead engineer + PM — runs the internal engineering team, ships continuously', color: 'indigo' },
  { id: 'ui', name: 'Pixel', emoji: '🎨', description: 'UI/UX engineer — Apple-level React components, design system, mobile-first', color: 'pink' },
  { id: 'backend', name: 'Stack', emoji: '⚙️', description: 'Backend engineer — API routes, Supabase, integrations, security', color: 'cyan' },
  { id: 'qa', name: 'Scout', emoji: '🔍', description: 'QA engineer — testing, bug hunting, quality gate before every ship', color: 'emerald' },
  { id: 'architect', name: 'Blueprint', emoji: '📐', description: 'Systems architect — user flows, API contracts, DB design, scalability', color: 'violet' },
  { id: 'cs', name: 'CS Agent', emoji: '🎓', description: 'Customer success support', color: 'slate' },
  { id: 'product', name: 'Product Agent', emoji: '🛠️', description: 'Feature planning, roadmap tracking', color: 'slate' },
];

function isSessionActive(session: Record<string, unknown>): boolean {
  if (session.status === 'running') return true;
  const updatedAt = session.updatedAt as number;
  if (!updatedAt) return false;
  const age = Date.now() - updatedAt;
  const terminated = ['done', 'error', 'aborted'].includes(session.status as string);
  if (!terminated && age < 90_000) return true;
  return false;
}

function readAgentSessions(agentId: string): { status: string; lastActive: string | null } {
  const home = process.env.HOME ?? '/Users/jarvis';
  const sessionsPath = path.join(home, '.openclaw', 'agents', agentId, 'sessions', 'sessions.json');

  try {
    const raw = fs.readFileSync(sessionsPath, 'utf8');
    const sessions: Record<string, Record<string, unknown>> = JSON.parse(raw);

    let latestUpdatedAt = 0;
    let hasActive = false;

    for (const session of Object.values(sessions)) {
      const updatedAt = (session.updatedAt as number) ?? 0;
      if (updatedAt > latestUpdatedAt) latestUpdatedAt = updatedAt;
      if (isSessionActive(session)) hasActive = true;
    }

    return {
      status: hasActive ? 'active' : 'idle',
      lastActive: latestUpdatedAt > 0 ? new Date(latestUpdatedAt).toISOString() : null,
    };
  } catch {
    return { status: 'idle', lastActive: null };
  }
}

export async function GET() {
  const agents = AGENTS.map((agent) => {
    const { status, lastActive } = readAgentSessions(agent.id);
    return { ...agent, status, lastActive };
  });

  return NextResponse.json({ agents });
}
