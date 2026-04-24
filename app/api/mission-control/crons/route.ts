import { NextResponse } from 'next/server';

interface RawSchedule {
  kind: 'cron' | 'every' | 'at';
  expr?: string;
  interval?: number;
  unit?: string;
  time?: string;
  tz?: string;
}

interface RawState {
  nextRunAtMs?: number;
  lastRunAtMs?: number;
  lastRunStatus?: string;
  lastStatus?: string;
  lastError?: string;
  consecutiveErrors?: number;
}

interface RawJob {
  id: string;
  name: string;
  description?: string;
  agentId?: string;
  enabled?: boolean;
  schedule?: RawSchedule;
  state?: RawState;
}

function formatScheduleString(schedule: RawSchedule | undefined): string {
  if (!schedule) return '';
  if (schedule.kind === 'cron') return schedule.expr ?? '';
  if (schedule.kind === 'every') {
    const unit = schedule.unit ?? 'minutes';
    const interval = schedule.interval ?? 1;
    return `every ${interval} ${unit}`;
  }
  if (schedule.kind === 'at') return `at ${schedule.time ?? ''}`;
  return '';
}

export async function GET() {
  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  if (!gatewayUrl) {
    return NextResponse.json(
      {
        jobs: [],
        total: 0,
        error: 'Configure OPENCLAW_GATEWAY_URL to connect to your OpenClaw instance.',
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const headers: Record<string, string> = {};
    if (gatewayToken) headers['Authorization'] = `Bearer ${gatewayToken}`;

    const res = await fetch(`${gatewayUrl}/api/crons`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      throw new Error(`Gateway returned ${res.status} ${res.statusText}`);
    }

    const raw: { jobs?: RawJob[] } = await res.json();
    const rawJobs: RawJob[] = Array.isArray(raw.jobs) ? raw.jobs : [];

    const jobs = rawJobs.map((j) => ({
      id: j.id,
      name: j.name,
      description: j.description ?? '',
      agent: j.agentId ?? '',
      scheduleKind: j.schedule?.kind ?? 'cron',
      scheduleExpr: j.schedule?.expr,
      scheduleInterval: j.schedule?.interval,
      scheduleUnit: j.schedule?.unit,
      scheduleTime: j.schedule?.time,
      scheduleTz: j.schedule?.tz,
      schedule: formatScheduleString(j.schedule),
      nextRun: j.state?.nextRunAtMs ? new Date(j.state.nextRunAtMs).toISOString() : null,
      lastRun: j.state?.lastRunAtMs ? new Date(j.state.lastRunAtMs).toISOString() : null,
      lastStatus: j.state?.lastStatus ?? j.state?.lastRunStatus ?? null,
      lastError: j.state?.lastError ?? null,
      consecutiveErrors: j.state?.consecutiveErrors ?? 0,
      enabled: j.enabled !== false,
    }));

    return NextResponse.json(
      { jobs, total: jobs.length },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        jobs: [],
        total: 0,
        error: `Could not reach OpenClaw gateway at ${gatewayUrl}. Make sure it's running and reachable.`,
        detail: msg,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
