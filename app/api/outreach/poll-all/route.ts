import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { messaging } from '@/lib/messaging';

/**
 * POST /api/outreach/poll-all
 *
 * Polls Linq for new responses across ALL active chapters.
 * Lightweight — designed to run on a cron every 15 minutes.
 * T2 goes out ONLY through the manual compile → approve → execute cycle.
 * This endpoint never auto-fires T2.
 */
export async function POST(_req: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  // Get all active chapters
  const { data: chapters } = await supabase
    .from('chapters')
    .select('id, chapter_name, fraternity, school, alumni_join_link')
    .eq('status', 'active');

  if (!chapters || chapters.length === 0) {
    return NextResponse.json({ data: { chapters_polled: 0, total_responses: 0, t2_fired: 0 }, error: null });
  }

  const summary = {
    chapters_polled: 0,
    total_new_responses: 0,
    total_flagged: 0,
    t2_fired: 0,
    errors: [] as string[],
  };

  for (const chapter of chapters) {
    try {
      // 1. Poll for new responses in this chapter
      const pollResult = await messaging.pollResponses({ chapter_id: chapter.id });
      summary.chapters_polled++;
      summary.total_new_responses += pollResult.new_responses;
      summary.total_flagged += pollResult.flagged_for_review.length;

      // 2. Flag any conversations that need human review
      for (const flagged of pollResult.flagged_for_review) {
        await supabase
          .from('alumni_contacts')
          .update({
            flagged: true,
            flagged_reason: flagged.reason || 'needs human review',
          })
          .eq('id', flagged.contact_id);
      }

      // Note: T2 is intentionally NOT auto-fired here.
      // Confirmed contacts will be picked up on the next manual compile → approve → execute cycle.
    } catch (err) {
      summary.errors.push(`${chapter.chapter_name}: ${String(err)}`);
    }
  }

  return NextResponse.json({ data: summary, error: null });
}
