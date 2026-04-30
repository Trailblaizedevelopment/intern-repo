import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// READ-ONLY access to external platform for school list
// This ONLY reads — never writes to the external database
const platformUrl = process.env.PLATFORM_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const platformKey = process.env.PLATFORM_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export async function GET() {
  try {
    if (!platformUrl || !platformKey) {
      return NextResponse.json({ schools: [] });
    }
    const supabase = createClient(platformUrl, platformKey);
    const { data, error } = await supabase
      .from('schools')
      .select('id, name, short_name, location')
      .order('name');

    if (error) {
      console.error('Schools fetch error:', error.message);
      return NextResponse.json({ schools: [] });
    }

    return NextResponse.json({ schools: data || [] });
  } catch {
    return NextResponse.json({ schools: [] });
  }
}
