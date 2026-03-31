import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getLinearCurrentUser, getLinearTeams, LINEAR_CONFIG } from '@/lib/linear';

/**
 * GET /api/linear/status
 * Check if an employee has connected their Linear account
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const employeeId = searchParams.get('employee_id');

  if (!employeeId) {
    return NextResponse.json(
      { error: 'Employee ID is required' },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();

    // Check if tokens exist for this employee
    const { data: tokenData, error } = await supabase
      .from('linear_oauth_tokens')
      .select('*')
      .eq('employee_id', employeeId)
      .single();

    if (error || !tokenData) {
      return NextResponse.json({
        connected: false,
        configured: !!LINEAR_CONFIG.clientId,
      });
    }

    // Token exists, verify it's still valid by making a test API call
    try {
      const user = await getLinearCurrentUser(tokenData.access_token);
      const teams = await getLinearTeams(tokenData.access_token);

      return NextResponse.json({
        connected: true,
        configured: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
        },
        teams: teams.map(t => ({
          id: t.id,
          name: t.name,
          key: t.key,
        })),
        connectedAt: tokenData.created_at,
      });
    } catch (apiError) {
      // Token is invalid, clean it up
      console.error('Linear token validation failed:', apiError);
      
      await supabase
        .from('linear_oauth_tokens')
        .delete()
        .eq('employee_id', employeeId);

      return NextResponse.json({
        connected: false,
        configured: !!LINEAR_CONFIG.clientId,
        error: 'Token expired or revoked',
      });
    }
  } catch (error) {
    console.error('Error checking Linear status:', error);
    return NextResponse.json(
      { error: 'Failed to check connection status' },
      { status: 500 }
    );
  }
}
