import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// GET this endpoint once to get the SQL needed to apply the chapter_members migration.
// Auth: requires the internal bearer token
export async function GET(request: Request) {
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${process.env.INTERNAL_API_KEY || ''}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  // Note: information_schema queries don't work via Supabase REST client.
  // Just return the SQL for manual execution in the Supabase dashboard.
  return NextResponse.json({
    status: 'needs_manual_run',
    message: 'Run this SQL in Supabase dashboard: https://supabase.com/dashboard/project/uoemlefauspgmmpeoilq/sql',
    sql: `ALTER TABLE chapter_members
  ADD COLUMN IF NOT EXISTS member_type TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS job_role TEXT,
  ADD COLUMN IF NOT EXISTS company TEXT,
  ADD COLUMN IF NOT EXISTS is_hiring BOOLEAN NOT NULL DEFAULT false;`,
  });
}
