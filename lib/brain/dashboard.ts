import { SupabaseClient } from '@supabase/supabase-js';
import { BrainAgentRunRow } from './agent-runs';
import { BrainTaskRow } from './tasks/types';

export interface BrainActionLogRow {
  id: string;
  source: string;
  skill_name: string;
  connector_name: string | null;
  status: string;
  error: string | null;
  created_at: string;
  conversation_id: string | null;
}

export interface BrainAutomationRow {
  id: string;
  name: string;
  kind: string;
  schedule: string | null;
  enabled: boolean;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
}

export interface BrainDashboardStats {
  activeTasks: number;
  completedToday: number;
  failedToday: number;
  toolCalls24h: number;
  toolSuccessRate24h: number;
  slackThreads: number;
  conversationsActive24h: number;
}

export interface BrainActivityDay {
  date: string;
  toolCalls: number;
  tasksCompleted: number;
  agentRuns: number;
}

export interface BrainAgentRunStats {
  runs24h: number;
  successRate24h: number;
  avgLatencyMs24h: number | null;
  totalTokens24h: number;
  runningNow: number;
  bySurface24h: Record<string, number>;
}

export interface BrainDashboardData {
  stats: BrainDashboardStats;
  agentRunStats: BrainAgentRunStats;
  activeTasks: BrainTaskRow[];
  recentTasks: BrainTaskRow[];
  recentActions: BrainActionLogRow[];
  recentAgentRuns: BrainAgentRunRow[];
  automations: BrainAutomationRow[];
  activityByDay: BrainActivityDay[];
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function buildActivityByDay(
  actions: BrainActionLogRow[],
  tasks: BrainTaskRow[],
  agentRuns: Pick<BrainAgentRunRow, 'created_at'>[],
  days = 7
): BrainActivityDay[] {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }

  const toolByDay = new Map<string, number>();
  const tasksByDay = new Map<string, number>();
  const runsByDay = new Map<string, number>();

  for (const a of actions) {
    const k = dayKey(a.created_at);
    toolByDay.set(k, (toolByDay.get(k) ?? 0) + 1);
  }

  for (const t of tasks) {
    if (t.status !== 'completed') continue;
    const k = dayKey(t.updated_at);
    tasksByDay.set(k, (tasksByDay.get(k) ?? 0) + 1);
  }

  for (const r of agentRuns) {
    const k = dayKey(r.created_at);
    runsByDay.set(k, (runsByDay.get(k) ?? 0) + 1);
  }

  return keys.map(date => ({
    date,
    toolCalls: toolByDay.get(date) ?? 0,
    tasksCompleted: tasksByDay.get(date) ?? 0,
    agentRuns: runsByDay.get(date) ?? 0,
  }));
}

function buildAgentRunStats(runs: BrainAgentRunRow[], dayAgo: string): BrainAgentRunStats {
  const runs24h = runs.filter(r => r.created_at >= dayAgo);
  const success24h = runs24h.filter(r => r.status === 'success').length;
  const latencies = runs24h
    .map(r => r.latency_ms)
    .filter((ms): ms is number => ms != null && ms > 0);
  const bySurface24h: Record<string, number> = {};
  for (const r of runs24h) {
    bySurface24h[r.surface] = (bySurface24h[r.surface] ?? 0) + 1;
  }

  return {
    runs24h: runs24h.length,
    successRate24h: runs24h.length > 0 ? Math.round((success24h / runs24h.length) * 100) : 100,
    avgLatencyMs24h:
      latencies.length > 0
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : null,
    totalTokens24h: runs24h.reduce((sum, r) => sum + r.input_tokens + r.output_tokens, 0),
    runningNow: runs.filter(r => r.status === 'running').length,
    bySurface24h,
  };
}

export async function getBrainDashboard(supabase: SupabaseClient): Promise<BrainDashboardData> {
  const todayStart = startOfTodayIso();
  const dayAgo = daysAgoIso(1);
  const weekAgo = daysAgoIso(7);

  const [
    activeTasksRes,
    recentTasksRes,
    actionsRes,
    weekActionsRes,
    weekTasksRes,
    weekAgentRunsRes,
    agentRunsRes,
    runningRunsRes,
    automationsRes,
    slackThreadsRes,
    activeConvosRes,
  ] = await Promise.all([
    supabase
      .from('brain_tasks')
      .select('*')
      .in('status', ['queued', 'planning', 'running', 'blocked'])
      .order('updated_at', { ascending: false })
      .limit(20),
    supabase.from('brain_tasks').select('*').order('created_at', { ascending: false }).limit(30),
    supabase
      .from('brain_action_log')
      .select('id, source, skill_name, connector_name, status, error, created_at, conversation_id')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('brain_action_log')
      .select('id, status, created_at')
      .gte('created_at', weekAgo),
    supabase
      .from('brain_tasks')
      .select('id, status, updated_at')
      .gte('updated_at', weekAgo),
    supabase
      .from('brain_agent_runs')
      .select('created_at')
      .gte('created_at', weekAgo),
    supabase
      .from('brain_agent_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('brain_agent_runs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'running'),
    supabase.from('brain_automations').select('*').order('name'),
    supabase
      .from('brain_conversations')
      .select('id', { count: 'exact', head: true })
      .like('title', 'slack:%'),
    supabase
      .from('brain_conversations')
      .select('id', { count: 'exact', head: true })
      .gte('updated_at', dayAgo),
  ]);

  const activeTasks = (activeTasksRes.data as BrainTaskRow[]) ?? [];
  const recentTasks = (recentTasksRes.data as BrainTaskRow[]) ?? [];
  const recentActions = (actionsRes.data as BrainActionLogRow[]) ?? [];
  const automations = (automationsRes.data as BrainAutomationRow[]) ?? [];
  const recentAgentRuns = (agentRunsRes.data as BrainAgentRunRow[]) ?? [];
  const weekAgentRuns = (weekAgentRunsRes.data as Pick<BrainAgentRunRow, 'created_at'>[]) ?? [];

  const actions24h = recentActions.filter(a => a.created_at >= dayAgo);
  const success24h = actions24h.filter(a => a.status === 'success').length;
  const completedToday = recentTasks.filter(
    t => t.status === 'completed' && t.updated_at >= todayStart
  ).length;
  const failedToday = recentTasks.filter(
    t => t.status === 'failed' && t.updated_at >= todayStart
  ).length;

  const weekActions = (weekActionsRes.data as BrainActionLogRow[]) ?? [];
  const weekTasks = (weekTasksRes.data as Pick<BrainTaskRow, 'id' | 'status' | 'updated_at'>[]) ?? [];
  const agentRunStats = buildAgentRunStats(recentAgentRuns, dayAgo);
  agentRunStats.runningNow = runningRunsRes.count ?? agentRunStats.runningNow;

  return {
    stats: {
      activeTasks: activeTasks.length,
      completedToday,
      failedToday,
      toolCalls24h: actions24h.length,
      toolSuccessRate24h:
        actions24h.length > 0 ? Math.round((success24h / actions24h.length) * 100) : 100,
      slackThreads: slackThreadsRes.count ?? 0,
      conversationsActive24h: activeConvosRes.count ?? 0,
    },
    agentRunStats,
    activeTasks,
    recentTasks,
    recentActions,
    recentAgentRuns,
    automations,
    activityByDay: buildActivityByDay(weekActions, weekTasks as BrainTaskRow[], weekAgentRuns),
  };
}
