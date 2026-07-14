import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { authenticateBrainRequest } from '@/lib/brain/auth';
import {
  getSupabaseMcpAllowedUserIds,
  getSupabaseMcpEndpointFor,
  isSupabaseMcpConfigured,
  listSupabaseDbCatalog,
} from '@/lib/brain/connectors/supabase-mcp';
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
    github_repo: process.env.GITHUB_REPO || 'Trailblaizedevelopment/Trailblaize-Web',
    github_configured: Boolean(process.env.GITHUB_TOKEN || process.env.GH_TOKEN),
    linear_read_only: process.env.BRAIN_LINEAR_READ_ONLY !== 'false',
    linear_mcp_url: process.env.LINEAR_MCP_URL || 'https://mcp.linear.app/mcp',
    supabase_mcp_configured: isSupabaseMcpConfigured(),
    supabase_mcp_read_only: true,
    supabase_mcp_databases: listSupabaseDbCatalog(),
    supabase_mcp_endpoints: isSupabaseMcpConfigured()
      ? {
          web: getSupabaseMcpEndpointFor('web'),
          crm: getSupabaseMcpEndpointFor('crm'),
        }
      : null,
    supabase_mcp_allowed_user_ids: [...getSupabaseMcpAllowedUserIds()],
    supabase_mcp_note:
      'Requires SUPABASE_ACCESS_TOKEN (PAT). Agent must ask Trailblaize 1.0 vs Growth Space before querying when unclear. Optional BRAIN_SUPABASE_MCP_ALLOWED_USER_IDS.',
    rate_limits: {
      per_minute: parseInt(process.env.BRAIN_RATE_LIMIT_PER_MINUTE || '8', 10) || 8,
      per_hour: parseInt(process.env.BRAIN_RATE_LIMIT_PER_HOUR || '40', 10) || 40,
    },
    max_tool_iterations: parseInt(process.env.BRAIN_MAX_TOOL_ITERATIONS || '8', 10) || 8,
  });
}
