import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function getSupabaseAdmin() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
}

// GET - List projects
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let query = supabase
      .from('projects')
      .select(`
        *,
        created_by_employee:employees!projects_created_by_fkey(id, name, email)
      `)
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching projects:', error);
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    }

    // Fetch ticket counts per project
    const projectIds = (data || []).map(p => p.id);
    if (projectIds.length > 0) {
      const { data: tickets } = await supabase
        .from('tickets')
        .select('project_id, status')
        .in('project_id', projectIds);

      const counts: Record<string, { total: number; done: number }> = {};
      (tickets || []).forEach(t => {
        if (!counts[t.project_id]) counts[t.project_id] = { total: 0, done: 0 };
        counts[t.project_id].total++;
        if (t.status === 'done') counts[t.project_id].done++;
      });

      const enriched = (data || []).map(p => ({
        ...p,
        ticket_count: counts[p.id]?.total || 0,
        tickets_done: counts[p.id]?.done || 0,
      }));

      return NextResponse.json({ data: enriched, error: null });
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}

// POST - Create project
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } }, { status: 500 });
    }

    const body = await request.json();
    const { name, description, status, platform, start_date, target_date, created_by } = body;

    if (!name) {
      return NextResponse.json({ data: null, error: { message: 'Name is required', code: 'VALIDATION_ERROR' } }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('projects')
      .insert([{
        name,
        description: description || null,
        status: status || 'active',
        platform: platform || 'web',
        start_date: start_date || null,
        target_date: target_date || null,
        created_by: created_by || null,
      }])
      .select('*')
      .single();

    if (error) {
      console.error('Error creating project:', error);
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}
