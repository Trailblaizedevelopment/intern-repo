import { NextRequest, NextResponse } from 'next/server';
import { getGoogleAuthUrl } from '@/lib/google';

/**
 * GET /api/google/auth
 * Initiates Google OAuth flow - redirects user to Google consent screen
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

  // Check if Google credentials are configured
  if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
    return NextResponse.json(
      { error: 'Google OAuth is not configured. Please set up Google Cloud credentials.' },
      { status: 500 }
    );
  }

  // Create state parameter with employee ID for callback
  const state = Buffer.from(JSON.stringify({ employeeId })).toString('base64');
  
  const authUrl = getGoogleAuthUrl(state);
  
  return NextResponse.redirect(authUrl);
}

/**
 * POST /api/google/auth
 * Returns the auth URL without redirecting (for client-side handling)
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

    if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
      return NextResponse.json(
        { error: 'Google OAuth is not configured' },
        { status: 500 }
      );
    }

    const state = Buffer.from(JSON.stringify({ employeeId })).toString('base64');
    const authUrl = getGoogleAuthUrl(state);

    return NextResponse.json({ authUrl });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate auth URL' },
      { status: 500 }
    );
  }
}
