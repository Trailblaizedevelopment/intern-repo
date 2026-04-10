import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/schools
 * Returns all schools for use in dropdowns (not filtered by pipeline activity).
 * Query params: search (partial name match), limit (default 50)
 */
export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 500 });

  const search = req.nextUrl.searchParams.get('search');
  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '100');

  let query = admin
    .from('schools')
    .select('id, name, state, conference')
    .order('name', { ascending: true })
    .limit(limit);

  if (search) {
    query = query.ilike('name', `%${search}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}
