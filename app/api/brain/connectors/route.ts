import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { authenticateBrainRequest } from '@/lib/brain/auth';
import { getAllowedSupabaseTables } from '@/lib/brain/connectors/supabase-data';
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
    supabase_read_only: true,
    supabase_views_prefix: 'brain_v_',
    supabase_fallback_views: getAllowedSupabaseTables(),
    supabase_max_rows: Math.min(
      parseInt(process.env.BRAIN_SUPABASE_MAX_ROWS || '25', 10) || 25,
      25
    ),
    supabase_note:
      'Only brain_v_* views are readable. Apply migration 20260714_brain_supabase_read_views.sql, then CREATE VIEW brain_v_* to expose more tables.',
    rate_limits: {
      per_minute: parseInt(process.env.BRAIN_RATE_LIMIT_PER_MINUTE || '8', 10) || 8,
      per_hour: parseInt(process.env.BRAIN_RATE_LIMIT_PER_HOUR || '40', 10) || 40,
    },
    max_tool_iterations: parseInt(process.env.BRAIN_MAX_TOOL_ITERATIONS || '8', 10) || 8,
  });
}
