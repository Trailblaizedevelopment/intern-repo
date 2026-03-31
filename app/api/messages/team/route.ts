import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// GET /api/messages/team - Get all team members for starting conversations
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ 
        data: null, 
        error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } 
      }, { status: 500 });
    }

    const employeeId = request.headers.get('x-employee-id');
    
    // Get all active employees except current user
    let query = supabase
      .from('employees')
      .select('id, name, role, avatar_url, status, department')
      .eq('status', 'active')
      .order('name');

    if (employeeId) {
      query = query.neq('id', employeeId);
    }

    const { data: employees, error } = await query;

    if (error) {
      console.error('Error fetching team members:', error);
      return NextResponse.json({ 
        data: null, 
        error: { message: error.message, code: 'DB_ERROR' } 
      }, { status: 500 });
    }

    const formattedEmployees = employees?.map(emp => ({
      id: emp.id,
      name: emp.name,
      role: emp.role,
      avatar_url: emp.avatar_url,
      isOnline: emp.status === 'active',
      department: emp.department
    })) || [];

    return NextResponse.json({ data: formattedEmployees, error: null });
  } catch (err) {
    console.error('Error in team GET:', err);
    return NextResponse.json({ 
      data: null, 
      error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } 
    }, { status: 500 });
  }
}
