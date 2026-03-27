import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * Validates the user session from the Authorization header or cookie.
 * Returns the authenticated user or null.
 * 
 * Usage in API routes:
 *   const user = await getAuthUser(request);
 *   if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 */
export async function getAuthUser(request: NextRequest) {
  try {
    // Check Authorization header first (Bearer token)
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    // Check cookie fallback
    const cookieToken = request.cookies.get('sb-access-token')?.value
      || request.cookies.get('supabase-auth-token')?.value;

    const accessToken = token || cookieToken;
    if (!accessToken) return null;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } }
    });

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) return null;

    return user;
  } catch {
    return null;
  }
}

/**
 * Quick unauthorized response helper.
 */
export function unauthorizedResponse() {
  return NextResponse.json(
    { error: 'Unauthorized — valid session required' },
    { status: 401 }
  );
}
