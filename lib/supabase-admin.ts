import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let _adminClient: SupabaseClient | null = null;

/**
 * Returns a singleton Supabase admin client using the service role key.
 * Use ONLY in server-side API routes — never expose to client.
 * Returns null if env vars are missing.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[supabase-admin] Missing SUPABASE_URL or SERVICE_ROLE_KEY');
    return null;
  }
  if (!_adminClient) {
    _adminClient = createClient(supabaseUrl, supabaseServiceKey);
  }
  return _adminClient;
}
