import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { authenticateBrainRequest } from '@/lib/brain/auth';
import { getConnectorStatus } from '@/lib/brain/router';

/**
 * GET /api/brain/connectors
 * Devin-only: list MCP connectors and availability (debug / Dev Console status).
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateBrainRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const connectors = await getConnectorStatus({
    supabase,
    employeeId: auth.identity.employeeId,
    mcpSessions: new Map(),
  });

  return NextResponse.json({
    connectors,
    linear_read_only: process.env.BRAIN_LINEAR_READ_ONLY !== 'false',
    linear_mcp_url: process.env.LINEAR_MCP_URL || 'https://mcp.linear.app/mcp',
  });
}
