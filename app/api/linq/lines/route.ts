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
  { line_number: 1, label: 'Owen',   line_phone: '+16462101111', daily_limit: 45 },
  { line_number: 2, label: 'Adam',   line_phone: '+16462178274', daily_limit: 45 },
  { line_number: 3, label: 'Ford',   line_phone: '+16462442696', daily_limit: 45 },
  { line_number: 4, label: 'Line 4', line_phone: '+14044239427', daily_limit: 45 },
  { line_number: 5, label: 'Line 5', line_phone: '+14045428435', daily_limit: 45 },
  { line_number: 6, label: 'Line 6', line_phone: '+19725590427', daily_limit: 45 },
  { line_number: 7, label: 'Line 7', line_phone: '+19725590438', daily_limit: 45 },
  { line_number: 8, label: 'Line 8', line_phone: '+15042234218', daily_limit: 45 },
  { line_number: 9, label: 'Line 9', line_phone: '+15042236050', daily_limit: 45 },
  { line_number: 10, label: 'Line 10', line_phone: '+12817773280', daily_limit: 45 },
  { line_number: 11, label: 'Line 11', line_phone: '+12817452268', daily_limit: 45 },
];

export async function GET(request: NextRequest) {
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

  // Auto-seed any missing lines from DEFAULT_LINES
  const existingNumbers = new Set((data || []).map((l: Record<string, unknown>) => l.line_number));
  const missing = DEFAULT_LINES.filter(l => !existingNumbers.has(l.line_number));
  if (missing.length > 0) {
    await supabase.from('linq_line_config').upsert(
      missing.map(l => ({ ...l, is_paused: false, is_warmed_up: true, round_robin_sequence: 0 })),
      { onConflict: 'line_number' }
    );
  }

  // Re-fetch after seed
  const { data: freshData } = missing.length > 0
    ? await supabase.from('linq_line_config').select('*').order('line_number')
    : { data };

  // Base DB data
  const baseData = (freshData && freshData.length > 0)
    ? freshData
    : DEFAULT_LINES.map(l => ({ ...l, is_paused: false, pause_reason: null }));

  // ── Merge with live Linq line-health ──────────────────────────────────────
  // Build the absolute URL for the line-health endpoint
  try {
    const reqUrl = new URL(request.url);
    const healthUrl = `${reqUrl.protocol}//${reqUrl.host}/api/linq/line-health`;

    const healthRes = await fetch(healthUrl, { next: { revalidate: 0 } });
    if (healthRes.ok) {
      const healthJson = await healthRes.json();
      const healthByPhone: Record<string, {
        linq_status: string;
        linq_active: boolean | null;
        sent_today: number;
      }> = {};

      for (const h of (healthJson.data || [])) {
        healthByPhone[h.phone] = {
          linq_status: h.linq_status,
          linq_active: h.linq_active,
          sent_today: h.sent_today,
        };
      }

      const merged = baseData.map((line: Record<string, unknown>) => {
        const h = healthByPhone[line.line_phone as string];
        if (!h) return line;
        return {
          ...line,
          linq_status: h.linq_status,
          linq_active: h.linq_active,
          sent_today: h.sent_today,
        };
      });

      return NextResponse.json({ data: merged, error: null, linq_api_ok: healthJson.linq_api_ok });
    }
  } catch {
    // Fall through to return base data if health fetch fails
  }

  return NextResponse.json({ data: baseData, error: null });
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
