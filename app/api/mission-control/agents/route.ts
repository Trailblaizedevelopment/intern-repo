import { NextResponse } from 'next/server';

const AGENTS = [
  { id: 'main',      name: 'Tony',          emoji: '🤙', description: "Chief of staff — Owen's right hand, orchestrates all agents", color: 'violet', isMain: true },
  { id: 'gtm',       name: 'Blaze',         emoji: '🔥', description: 'GTM co-pilot — Adam + Ford liaison, $10M plan, IFC/Nationals pipeline', color: 'amber' },
  { id: 'sales',     name: 'Sales Agent',   emoji: '💰', description: 'Pipeline research, lead gen, outreach drafting', color: 'emerald' },
  { id: 'alumni',    name: 'Alumni Agent',  emoji: '📬', description: 'Alumni outreach execution, T1/T2/T3 cadence, response monitoring', color: 'blue' },
  { id: 'success',   name: 'Success Agent', emoji: '🚀', description: 'Chapter health, onboarding, CS operations', color: 'teal' },
  { id: 'dev',       name: 'Forge',         emoji: '⚒️', description: 'Lead engineer + PM — runs the internal engineering team, ships continuously', color: 'indigo' },
  { id: 'ui',        name: 'Pixel',         emoji: '🎨', description: 'UI/UX engineer — Apple-level React components, design system, mobile-first', color: 'pink' },
  { id: 'backend',   name: 'Stack',         emoji: '⚙️', description: 'Backend engineer — API routes, Supabase, integrations, security', color: 'cyan' },
  { id: 'qa',        name: 'Scout',         emoji: '🔍', description: 'QA engineer — testing, bug hunting, quality gate before every ship', color: 'emerald' },
  { id: 'architect', name: 'Blueprint',     emoji: '📐', description: 'Systems architect — user flows, API contracts, DB design, scalability', color: 'violet' },
  { id: 'cs',        name: 'CS Agent',      emoji: '🎓', description: 'Customer success support', color: 'slate' },
  { id: 'product',   name: 'Product Agent', emoji: '🛠️', description: 'Feature planning, roadmap tracking', color: 'slate' },
];

export async function GET() {
  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  // Try to fetch live session data from the gateway
  if (gatewayUrl) {
    try {
      const headers: Record<string, string> = {};
      if (gatewayToken) headers['Authorization'] = `Bearer ${gatewayToken}`;

      const res = await fetch(`${gatewayUrl}/api/agents`, {
        headers,
        signal: AbortSignal.timeout(5_000),
      });

      if (res.ok) {
        const data = await res.json();
        // Merge gateway live data with our static agent definitions
        const liveMap: Record<string, { status?: string; lastActive?: string | null }> = {};
        if (Array.isArray(data.agents)) {
          for (const a of data.agents) {
            liveMap[a.id] = { status: a.status, lastActive: a.lastActive };
          }
        }
        const agents = AGENTS.map((agent) => ({
          ...agent,
          status: liveMap[agent.id]?.status ?? 'idle',
          lastActive: liveMap[agent.id]?.lastActive ?? null,
          gatewayConnected: true,
        }));
        return NextResponse.json({ agents, gatewayConnected: true });
      }
    } catch {
      // Fall through to static data
    }
  }

  // Fallback: static agents, no live status
  const agents = AGENTS.map((agent) => ({
    ...agent,
    status: 'idle' as const,
    lastActive: null,
    gatewayConnected: false,
  }));

  return NextResponse.json({ agents, gatewayConnected: false });
}
