// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { revokeToken } from '@/lib/google';

/**
 * POST /api/google/disconnect
 * Disconnects the user's Google account by revoking tokens and removing from database
 */
export async function POST(request: NextRequest) {
  try {
    const { employeeId } = await request.json();

    if (!employeeId) {
      return NextResponse.json(
        { error: 'Employee ID is required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Get tokens from database
    const { data: tokenData } = await supabase
      .from('google_oauth_tokens')
      .select('access_token, refresh_token')
      .eq('employee_id', employeeId)
      .single();

    // Revoke tokens with Google (best effort)
    if (tokenData?.access_token) {
      try {
        await revokeToken(tokenData.access_token);
      } catch (e) {
        console.log('Token revocation failed (token may already be invalid)');
      }
    }

    // Delete tokens from database
    const { error: deleteError } = await supabase
      .from('google_oauth_tokens')
      .delete()
      .eq('employee_id', employeeId);

    if (deleteError) {
      console.error('Failed to delete tokens:', deleteError);
      return NextResponse.json(
        { error: 'Failed to disconnect account' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Disconnect error:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect Google account' },
      { status: 500 }
    );
  }
}
