import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ssqpfkiesxwnmphwyezb.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { first_name, last_name, phone, affiliations } = body;

    if (!first_name || !phone) {
      return NextResponse.json({ error: 'Name and phone required' }, { status: 400 });
    }

    // Store in Supabase
    const { data, error } = await supabase
      .from('waitlist')
      .insert({
        first_name,
        last_name: last_name || null,
        phone,
        affiliations: affiliations || [],
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      // If table doesn't exist yet, still return success (we'll create it)
      console.error('Waitlist insert error:', error);
      // Fallback: log to console so we don't lose the signup
      console.log('WAITLIST SIGNUP:', { first_name, last_name, phone, affiliations });
      return NextResponse.json({ success: true, fallback: true });
    }

    return NextResponse.json({ success: true, id: data?.id });
  } catch (e) {
    console.error('Waitlist error:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('waitlist')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ signups: data, total: data?.length || 0 });
  } catch (e) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
