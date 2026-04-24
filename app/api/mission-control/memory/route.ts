import { NextResponse } from 'next/server';

// Memory is stored locally on the Mac mini and syncs through the OpenClaw gateway.
// On Vercel, we surface a helpful message directing users to connect the gateway.

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL;

  if (!gatewayUrl) {
    if (type === 'longterm') {
      return NextResponse.json({
        content: '',
        message: 'Connect your OpenClaw gateway to view memory files.',
        connected: false,
      });
    }
    return NextResponse.json({
      entries: [],
      message: 'Connect your OpenClaw gateway to view memory files.',
      connected: false,
    });
  }

  // Gateway is configured — proxy the request
  const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  const headers: Record<string, string> = {};
  if (gatewayToken) headers['Authorization'] = `Bearer ${gatewayToken}`;

  try {
    const url = type === 'longterm'
      ? `${gatewayUrl}/api/memory?type=longterm`
      : `${gatewayUrl}/api/memory`;

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });

    if (!res.ok) throw new Error(`Gateway returned ${res.status}`);

    const data = await res.json();
    return NextResponse.json({ ...data, connected: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (type === 'longterm') {
      return NextResponse.json({
        content: '',
        message: `Gateway unreachable: ${msg}`,
        connected: false,
      });
    }
    return NextResponse.json({
      entries: [],
      message: `Gateway unreachable: ${msg}`,
      connected: false,
    });
  }
}
