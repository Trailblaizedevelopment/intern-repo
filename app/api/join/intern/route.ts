import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, phone, email, school, instagram, majorYear, resumeLink, why, submitted_at } = body;

    if (!name || !phone || !email) {
      return NextResponse.json(
        { data: null, error: { message: 'Name, phone, and email are required' } },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ data: { name }, error: null });
    }

    const experienceParts = [
      school ? `School: ${school}` : '',
      majorYear ? `Major/Year: ${majorYear}` : '',
      instagram ? `Instagram: ${instagram}` : '',
    ].filter(Boolean);

    const { data, error } = await supabase
      .from('applications')
      .insert([
        {
          name,
          email,
          phone,
          position: 'growth_intern',
          experience: experienceParts.join(' | ') || null,
          portfolio_url: resumeLink || null,
          why_trailblaize: why,
          source: 'join_flow',
          status: 'pending',
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error saving intern application:', error);
      return NextResponse.json({ data: null, error: null });
    }

    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error('Unexpected error in intern application:', err);
    return NextResponse.json({ data: null, error: null });
  }
}
