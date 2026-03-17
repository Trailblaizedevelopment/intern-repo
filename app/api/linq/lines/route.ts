import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * Linq line configuration — stored in the internal workspace DB.
 * Table: linq_line_config (id, line_phone, label, line_number, is_paused, pause_reason, updated_at)
 *
 * GET  /api/linq/lines        — returns all 3 line configs
 * PATCH /api/linq/lines       — update a line's pause state
 *   body: { line_phone: string, is_paused: boolean, pause_reason?: string }
 */

const DEFAULT_LINES = [
  { line_number: 1, label: 'Owen',  line_phone: '+16462101111', daily_limit: 45 },
  { line_number: 2, label: 'Adam',  line_phone: '+16462668785', daily_limit: 45 },
  { line_number: 3, label: 'Ford',  line_phone: '+16462442696', daily_limit: 45 },
];

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ data: DEFAULT_LINES.map(l => ({ ...l, is_paused: false, pause_reason: null })), error: null });

  const { data, error } = await supabase
    .from('linq_line_config')
    .select('*')
    .order('line_number');

  if (error) {
    // Table may not exist yet — return defaults
    return NextResponse.json({
      data: DEFAULT_LINES.map(l => ({ ...l, is_paused: false, pause_reason: null })),
      error: null,
    });
  }

  // If DB has rows, return them directly (source of truth)
  // Fall back to DEFAULT_LINES only if DB is empty
  if (data && data.length > 0) {
    return NextResponse.json({ data, error: null });
  }

  return NextResponse.json({
    data: DEFAULT_LINES.map(l => ({ ...l, is_paused: false, pause_reason: null })),
    error: null,
  });
}

export async function PATCH(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ data: null, error: 'DB not configured' }, { status: 500 });

  const body = await request.json();
  const { line_phone, is_paused, pause_reason } = body;

  if (!line_phone || typeof is_paused !== 'boolean') {
    return NextResponse.json({ data: null, error: 'line_phone and is_paused are required' }, { status: 400 });
  }

  // Look up the line from DB (not hardcoded — supports any line)
  const { data: existingLine } = await supabase
    .from('linq_line_config')
    .select('*')
    .eq('line_phone', line_phone)
    .single();

  if (!existingLine) return NextResponse.json({ data: null, error: 'Unknown line' }, { status: 404 });

  const { data, error } = await supabase
    .from('linq_line_config')
    .update({
      is_paused,
      pause_reason: is_paused ? (pause_reason?.trim() || null) : null,
      updated_at: new Date().toISOString(),
    })
    .eq('line_phone', line_phone)
    .select()
    .single();

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });

  return NextResponse.json({ data, error: null });
}
