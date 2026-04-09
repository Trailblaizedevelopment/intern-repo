import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/employees
 * Returns all employees, optionally filtered by status or email.
 * Query params: status (active|onboarding|inactive), email, auth_user_id
 */
export async function GET(request: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const email = searchParams.get('email');
    const authUserId = searchParams.get('auth_user_id');

    let query = supabaseAdmin.from('employees').select('*').order('name');
    if (status) query = query.eq('status', status);
    if (email) query = query.eq('email', email);
    if (authUserId) query = query.eq('auth_user_id', authUserId);

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching employees:', error);
      return NextResponse.json({ data: null, error: { message: error.message, code: error.code } }, { status: 500 });
    }
    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check for required environment variables
    // Admin client with service role key - bypasses RLS and email confirmation
    const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

    const body = await request.json();
    const { email, password, name, role, seniority, department, status, start_date } = body;

    // Validate required fields
    if (!email || !password || !name) {
      return NextResponse.json(
        { data: null, error: { message: 'Email, password, and name are required', code: 'MISSING_FIELDS' } },
        { status: 400 }
      );
    }

    // Create auth user using admin API (no email sent, auto-confirmed)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm the email
      user_metadata: {
        name,
        role,
      },
    });

    if (authError) {
      console.error('Error creating auth user:', authError);
      return NextResponse.json(
        { data: null, error: { message: authError.message, code: 'AUTH_ERROR' } },
        { status: 400 }
      );
    }

    // Step 2: Create employee record linked to auth user
    const { data: employeeData, error: employeeError } = await supabaseAdmin
      .from('employees')
      .insert([{
        name,
        email,
        role,
        seniority: seniority || 1,
        department: department || '',
        status: status || 'onboarding',
        start_date: start_date || new Date().toISOString().split('T')[0],
        auth_user_id: authData.user?.id,
      }])
      .select()
      .single();

    if (employeeError) {
      console.error('Error creating employee:', employeeError);
      // Try to clean up the auth user if employee creation fails
      if (authData.user?.id) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      }
      return NextResponse.json(
        { data: null, error: { message: employeeError.message, code: employeeError.code || 'DB_ERROR' } },
        { status: 400 }
      );
    }

    return NextResponse.json({ data: employeeData, error: null });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
