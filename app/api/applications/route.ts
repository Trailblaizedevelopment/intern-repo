import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export interface JobApplication {
  id: string;
  name: string;
  email: string;
  phone?: string;
  position: string;
  resume_url?: string;
  cover_letter?: string;
  linkedin_url?: string;
  portfolio_url?: string;
  why_trailblaize?: string;
  experience?: string;
  availability?: string;
  hours_per_week?: number;
  status: 'pending' | 'reviewing' | 'interview' | 'offered' | 'accepted' | 'rejected' | 'withdrawn';
  reviewer_id?: string;
  reviewer_notes?: string;
  rating?: number;
  source: string;
  referral_source?: string;
  applied_at: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
}

// GET - Fetch all applications (for admin review)
export async function GET(request: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const position = searchParams.get('position');

    let query = supabaseAdmin!
      .from('job_applications')
      .select('*')
      .order('applied_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    if (position && position !== 'all') {
      query = query.eq('position', position);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching applications:', error);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: 'DB_ERROR' } },
        { status: 400 }
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}

// POST - Submit a new application (public endpoint for careers page)
export async function POST(request: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    const body = await request.json();
    const {
      name,
      email,
      phone,
      position,
      resume_url,
      cover_letter,
      linkedin_url,
      portfolio_url,
      why_trailblaize,
      experience,
      availability,
      hours_per_week,
      source,
      referral_source,
    } = body;

    // Validate required fields
    if (!name || !email || !position) {
      return NextResponse.json(
        { data: null, error: { message: 'Name, email, and position are required', code: 'MISSING_FIELDS' } },
        { status: 400 }
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { data: null, error: { message: 'Invalid email format', code: 'INVALID_EMAIL' } },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin!
      .from('job_applications')
      .insert([{
        name,
        email,
        phone: phone || null,
        position,
        resume_url: resume_url || null,
        cover_letter: cover_letter || null,
        linkedin_url: linkedin_url || null,
        portfolio_url: portfolio_url || null,
        why_trailblaize: why_trailblaize || null,
        experience: experience || null,
        availability: availability || null,
        hours_per_week: hours_per_week || null,
        source: source || 'website',
        referral_source: referral_source || null,
        status: 'pending',
        applied_at: new Date().toISOString(),
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating application:', error);
      return NextResponse.json(
        { data: null, error: { message: error.message, code: error.code || 'DB_ERROR' } },
        { status: 400 }
      );
    }

    return NextResponse.json({ data, error: null });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
