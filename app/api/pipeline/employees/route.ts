import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET() {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json([]);
  const { data } = await admin
    .from('employees')
    .select('id, name')
    .eq('status', 'active')
    .order('name');
  return NextResponse.json(data || []);
}
