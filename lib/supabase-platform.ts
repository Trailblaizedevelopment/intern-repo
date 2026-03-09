import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Server-side only — connects to the external Trailblaize platform (trailblaize.net)
// Use this for alumni_contacts, chapters, and other platform data.

const platformUrl = process.env.PLATFORM_SUPABASE_URL || '';
const platformServiceKey = process.env.PLATFORM_SUPABASE_SERVICE_ROLE_KEY || '';

let _platformClient: SupabaseClient | null = null;

/**
 * Returns a singleton Supabase admin client for the external Trailblaize platform.
 * Use ONLY in server-side API routes — never expose to client.
 * Returns null if env vars are missing.
 */
export function getPlatformAdmin(): SupabaseClient | null {
  if (!platformUrl || !platformServiceKey) {
    console.error('[supabase-platform] Missing PLATFORM_SUPABASE_URL or PLATFORM_SUPABASE_SERVICE_ROLE_KEY');
    return null;
  }
  if (!_platformClient) {
    _platformClient = createClient(platformUrl, platformServiceKey);
  }
  return _platformClient;
}
