import { NextRequest, NextResponse } from 'next/server';
import { SENDING_LINES } from '@/lib/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ data: null, error: { message: 'Database not connected', code: 'DB_ERROR' } }, { status: 500 });
  }
  try {
    const chapterId = new URL(request.url).searchParams.get('chapter_id');
    if (!chapterId) {
      return NextResponse.json({ data: null, error: { message: 'chapter_id is required', code: 'VALIDATION_ERROR' } }, { status: 400 });
    }

    const countQuery = async (lineNumber: number, status?: string) => {
      let q = supabase
        .from('outreach_queue')
        .select('*', { count: 'exact', head: true })
        .eq('chapter_id', chapterId)
        .eq('line_number', lineNumber);
      if (status) q = q.eq('status', status);
      const { count } = await q;
      return count ?? 0;
    };

    const lines = await Promise.all(SENDING_LINES.map(async (ln) => {
      const [total, sent, failed] = await Promise.all([
        countQuery(ln.number),
        countQuery(ln.number, 'sent'),
        countQuery(ln.number, 'failed'),
      ]);
      const pending = total - sent - failed;
      const processed = sent + failed;
      const currentDay = total > 0 ? Math.floor(processed / ln.daily_limit) + 1 : 0;
      const totalDays = total > 0 ? Math.ceil(total / ln.daily_limit) : 0;

      return {
        number: ln.number,
        label: ln.label,
        daily_limit: ln.daily_limit,
        total,
        sent,
        failed,
        pending,
        current_day: Math.min(currentDay, totalDays),
        total_days: totalDays,
      };
    }));

    const totalAll = lines.reduce((s, l) => s + l.total, 0);
    const totalSent = lines.reduce((s, l) => s + l.sent, 0);
    const totalFailed = lines.reduce((s, l) => s + l.failed, 0);
    const totalPending = lines.reduce((s, l) => s + l.pending, 0);
    const maxDays = Math.max(...lines.map(l => l.total_days), 0);
    const maxRemainingDays = Math.max(
      ...lines.map(l => l.pending > 0 ? Math.ceil(l.pending / l.daily_limit) : 0),
      0,
    );

    return NextResponse.json({
      data: {
        total: totalAll,
        sent: totalSent,
        failed: totalFailed,
        pending: totalPending,
        days_remaining: maxRemainingDays,
        total_days: maxDays,
        lines,
      },
      error: null,
    });
  } catch (err) {
    console.error('Error fetching dashboard:', err);
    return NextResponse.json({ data: null, error: { message: 'Failed to fetch dashboard', code: 'SERVER_ERROR' } }, { status: 500 });
  }
}
