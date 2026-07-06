import { NextRequest, NextResponse } from 'next/server';
import { authenticateBrainRequest } from '@/lib/brain/auth';
import { getBrainDashboard } from '@/lib/brain/dashboard';
import { getConnectorStatus } from '@/lib/brain/router';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/brain/dashboard
 * Devin-only ops overview: tasks, tool audit trail, automations, connectors.
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

  const [dashboard, connectors] = await Promise.all([
    getBrainDashboard(supabase),
    getConnectorStatus({
      supabase,
      employeeId: auth.identity.employeeId,
      mcpSessions: new Map(),
    }),
  ]);

  return NextResponse.json({
    ...dashboard,
    connectors,
    linear_read_only: process.env.BRAIN_LINEAR_READ_ONLY !== 'false',
    rate_limits: {
      per_minute: parseInt(process.env.BRAIN_RATE_LIMIT_PER_MINUTE || '8', 10) || 8,
      per_hour: parseInt(process.env.BRAIN_RATE_LIMIT_PER_HOUR || '40', 10) || 40,
    },
    primary_surface: 'slack',
  });
}
