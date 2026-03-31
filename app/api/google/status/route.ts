import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/google/status
 * Checks if Google account is connected for a user
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

    // Check if tokens exist
    const { data, error } = await supabase
      .from('google_oauth_tokens')
      .select('expires_at, scope')
      .eq('employee_id', employeeId)
      .single();

    if (error || !data) {
      return NextResponse.json({
        connected: false,
        scopes: [],
      });
    }

    // Check if token is expired
    const isExpired = new Date(data.expires_at) <= new Date();
    const scopes = data.scope?.split(' ') || [];

    return NextResponse.json({
      connected: true,
      isExpired,
      scopes,
      hasCalendar: scopes.some((s: string) => s.includes('calendar')),
      hasGmail: scopes.some((s: string) => s.includes('gmail')),
    });
  } catch (error) {
    console.error('Status check error:', error);
    return NextResponse.json(
      { error: 'Failed to check status' },
      { status: 500 }
    );
  }
}
