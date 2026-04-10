// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/portal/leads
 * Params:
 *   employee_id   - required, filter by employee
 *   status        - optional, filter by status
 *   exclude_statuses - optional, comma-separated statuses to exclude (e.g. 'converted,lost')
 *   order_by      - optional, 'last_contact' | 'created_at' (default: created_at desc)
 *   limit         - optional, max results
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employee_id');
    const status = searchParams.get('status');
    const excludeStatuses = searchParams.get('exclude_statuses');
    const orderBy = searchParams.get('order_by') || 'created_at';
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;

    if (!employeeId) {
      return NextResponse.json(
        { data: null, error: { message: 'employee_id is required', code: 'MISSING_PARAM' } },
        { status: 400 }
      );
    }

    let query = getSupabaseAdmin()
      .from('personal_leads')
      .select('*')
      .eq('employee_id', employeeId);

    if (status) {
      query = query.eq('status', status);
    }

    if (excludeStatuses) {
      const statuses = excludeStatuses.split(',').map(s => s.trim());
      query = query.not('status', 'in', `(${statuses.map(s => `"${s}"`).join(',')})`);
    }

    if (orderBy === 'last_contact') {
      query = query.order('last_contact', { ascending: true });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching portal leads:', error);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (error) {
    console.error('Portal leads GET error:', error);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

/**
 * POST /api/portal/leads
 * Create a new personal lead
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { employee_id, name, email, phone, organization, lead_type, notes, status } = body;

    if (!employee_id || !name) {
      return NextResponse.json(
        { data: null, error: { message: 'employee_id and name are required', code: 'MISSING_PARAM' } },
        { status: 400 }
      );
    }

    const { data, error } = await getSupabaseAdmin()
      .from('personal_leads')
      .insert({
        employee_id,
        name,
        email: email || null,
        phone: phone || null,
        organization: organization || null,
        lead_type: lead_type || 'other',
        notes: notes || null,
        status: status || 'new',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating portal lead:', error);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: 'DB_ERROR' } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data, error: null }, { status: 201 });
  } catch (error) {
    console.error('Portal leads POST error:', error);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
