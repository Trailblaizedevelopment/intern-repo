import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/outreach/preview-chapter?chapter_id=xxx&t1_limit=45
 *
 * Dry-run preview of what compile-chapter would include.
 * No writes — just returns eligible contacts with name + grad year.
 *
 * Returns:
 *   {
 *     t1: { contacts: [{id, first_name, last_name, year}][], total: number, cap: number },
 *     t2: { contacts: [], total: number },
 *     t3: { contacts: [], total: number },
 *     lines: { active: number, t1_cap_per_line: number, t1_cap_total: number },
 *   }
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const chapterId = searchParams.get('chapter_id');
  if (!chapterId) return NextResponse.json({ error: 'chapter_id required' }, { status: 400 });

  const t1LimitParam = searchParams.get('t1_limit');

  try {
    // Fetch line config
    const { data: lineConfigs } = await supabase
      .from('linq_line_config')
      .select('line_number, is_paused, daily_limit, is_warmed_up, warmup_start_date')
      .order('line_number');

    const DEFAULT_DAILY_LIMIT = 45;
    const activeLines = (lineConfigs || []).filter((l: { is_paused: boolean }) => !l.is_paused);
    const activeCount = activeLines.length || 3;

    function getLineT1Cap(line: { is_warmed_up: boolean | null; warmup_start_date: string | null; daily_limit: number }): number {
      if (line.is_warmed_up !== false) return line.daily_limit;
      if (!line.warmup_start_date) return 10;
      const days = Math.floor((Date.now() - new Date(line.warmup_start_date).getTime()) / 86400000);
      if (days < 7) return 10;
      if (days < 14) return 20;
      if (days < 21) return 30;
      return line.daily_limit;
    }

    const t1CapMax = activeLines.length > 0
      ? activeLines.reduce((sum: number, l: { is_warmed_up: boolean | null; warmup_start_date: string | null; daily_limit: number }) => sum + getLineT1Cap(l), 0)
      : activeCount * DEFAULT_DAILY_LIMIT;

    // Cross-chapter oversend guard: subtract T1s already sent today across ALL chapters
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: sentTodayRows } = await supabase
      .from('alumni_contacts')
      .select('assigned_line')
      .not('touch1_sent_at', 'is', null)
      .gte('touch1_sent_at', todayStart.toISOString());

    const sentTodayTotal = (sentTodayRows || []).length;
    const t1CapTotal = Math.max(0, t1CapMax - sentTodayTotal);

    // Apply user override if provided, capped at remaining capacity
    // Also enforce BATCH_TOTAL_CAP so T1 + T2 + T3 never exceeds 30
    const BATCH_TOTAL_CAP = 30;
    const t1Limit = t1LimitParam
      ? Math.min(parseInt(t1LimitParam), t1CapTotal, BATCH_TOTAL_CAP)
      : Math.min(t1CapTotal, BATCH_TOTAL_CAP);

    const cutoff2days = new Date(Date.now() - 2 * 86400000).toISOString();
    const cutoff4days = new Date(Date.now() - 4 * 86400000).toISOString();
    const t2t3Cap = activeCount * 100;

    // T1 eligible
    const { data: t1Raw } = await supabase
      .from('alumni_contacts')
      .select('id, first_name, last_name, year')
      .eq('chapter_id', chapterId)
      .eq('outreach_status', 'not_contacted')
      .not('is_imessage', 'is', false)
      .not('phone_primary', 'is', null)
      .or('phone_type.is.null,and(phone_type.neq.landline,phone_type.neq.voip)')
      .gte('year', 1970)
      .order('year', { ascending: false })
      .limit(t1Limit);

    // T2 eligible
    const { data: t2aRaw } = await supabase
      .from('alumni_contacts')
      .select('id, first_name, last_name, year')
      .eq('chapter_id', chapterId)
      .eq('outreach_status', 'touch1_sent')
      .lte('touch1_sent_at', cutoff2days)
      .is('touch2_sent_at', null)
      .not('is_imessage', 'is', false)
      .not('phone_primary', 'is', null)
      .limit(t2t3Cap);

    const { data: t2bRaw } = await supabase
      .from('alumni_contacts')
      .select('id, first_name, last_name, year')
      .eq('chapter_id', chapterId)
      .eq('outreach_status', 'no_response')
      .lte('touch1_sent_at', cutoff2days)
      .is('touch2_sent_at', null)
      .not('is_imessage', 'is', false)
      .not('phone_primary', 'is', null)
      .limit(t2t3Cap);

    const t2Map = new Map<string, { id: string; first_name: string | null; last_name: string | null; year: number | null }>();
    for (const c of [...(t2aRaw || []), ...(t2bRaw || [])]) {
      if (!t2Map.has(c.id)) t2Map.set(c.id, c);
    }
    const t2Contacts = [...t2Map.values()].slice(0, t2t3Cap);

    // T3 eligible
    const t3Remaining = Math.max(0, t2t3Cap - t2Contacts.length);
    let t3Contacts: { id: string; first_name: string | null; last_name: string | null; year: number | null }[] = [];
    if (t3Remaining > 0) {
      const { data: t3Raw } = await supabase
        .from('alumni_contacts')
        .select('id, first_name, last_name, year')
        .eq('chapter_id', chapterId)
        .eq('outreach_status', 'touch2_sent')
        .lte('touch2_sent_at', cutoff4days)
        .is('touch3_sent_at', null)
        .not('is_imessage', 'is', false)
        .not('phone_primary', 'is', null)
        .limit(t3Remaining);
      t3Contacts = t3Raw || [];
    }

    // Check for missing join link — warn before compile
    const { data: chapterRow } = await supabase
      .from('chapters')
      .select('alumni_join_link')
      .eq('id', chapterId)
      .single();

    const hasJoinLink = !!chapterRow?.alumni_join_link;
    const t2t3Remaining = Math.max(0, BATCH_TOTAL_CAP - (t1Raw || []).length);

    const warnings: string[] = [];
    if (!hasJoinLink) warnings.push('No chapter join link set — T2/T3 sends are blocked until you add one in chapter settings.');
    if (sentTodayTotal > 0) warnings.push(`${sentTodayTotal} T1s already sent today across all chapters — remaining capacity: ${t1CapTotal}.`);
    if (t1CapTotal === 0) warnings.push('Daily T1 capacity reached across all chapters. Only T2/T3 follow-ups can go out today.');

    return NextResponse.json({
      t1: { contacts: t1Raw || [], total: (t1Raw || []).length, cap: t1Limit, max_cap: t1CapTotal, sent_today: sentTodayTotal, daily_max: t1CapMax },
      t2: { contacts: hasJoinLink ? t2Contacts.slice(0, t2t3Remaining) : [], total: hasJoinLink ? Math.min(t2Contacts.length, t2t3Remaining) : 0 },
      t3: { contacts: hasJoinLink ? t3Contacts.slice(0, Math.max(0, t2t3Remaining - t2Contacts.length)) : [], total: hasJoinLink ? Math.min(t3Contacts.length, Math.max(0, t2t3Remaining - t2Contacts.length)) : 0 },
      lines: { active: activeCount, t1_cap_total: t1CapTotal, sent_today: sentTodayTotal },
      batch_total_cap: BATCH_TOTAL_CAP,
      has_join_link: hasJoinLink,
      warnings,
    });
  } catch (err) {
    console.error('[preview-chapter]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
