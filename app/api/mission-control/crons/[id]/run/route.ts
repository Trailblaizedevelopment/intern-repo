import { NextRequest, NextResponse } from 'next/server';

// POST /api/mission-control/crons/[id]/run — trigger a cron job via OpenClaw gateway
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 });
  }

  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
  const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  if (!gatewayUrl) {
    return NextResponse.json(
      { ok: false, error: 'Configure OPENCLAW_GATEWAY_URL to trigger cron jobs.' },
      { status: 503 }
    );
  }

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (gatewayToken) headers['Authorization'] = `Bearer ${gatewayToken}`;

    const res = await fetch(`${gatewayUrl}/api/crons/${id}/run`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(20_000),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: data.error ?? `Gateway returned ${res.status}` },
        { status: res.status }
      );
    }

    return NextResponse.json({ ok: true, output: data.output ?? 'Job triggered.' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: `Gateway unreachable: ${msg}` },
      { status: 503 }
    );
  }
}
