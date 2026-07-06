import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * Dev Console access is restricted to the founding engineer.
 * Enforced server-side on every /api/brain/* route — never rely on UI gating.
 */
const DEV_CONSOLE_EMAILS = ['devin@trailblaize.net'];

export interface BrainIdentity {
  authUserId: string;
  email: string;
  employeeId: string | null;
  employeeName: string | null;
}

export type BrainAuthResult =
  | { ok: true; identity: BrainIdentity }
  | { ok: false; error: string; status: number };

/**
 * Verifies the Supabase access token from the Authorization header and
 * checks the user against the Dev Console allowlist. Resolves the matching
 * employees row so skills can filter by "my tickets".
 */
export async function authenticateBrainRequest(req: NextRequest): Promise<BrainAuthResult> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return { ok: false, error: 'Missing bearer token', status: 401 };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false, error: 'Database not configured', status: 500 };
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false, error: 'Invalid or expired session', status: 401 };
  }

  const email = (data.user.email || '').toLowerCase();
  if (!DEV_CONSOLE_EMAILS.includes(email)) {
    return { ok: false, error: 'Dev Console access denied', status: 403 };
  }

  const { data: employee } = await supabase
    .from('employees')
    .select('id, name')
    .eq('email', email)
    .maybeSingle();

  return {
    ok: true,
    identity: {
      authUserId: data.user.id,
      email,
      employeeId: employee?.id ?? null,
      employeeName: employee?.name ?? null,
    },
  };
}
