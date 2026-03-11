import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { messaging } from '@/lib/messaging';

/**
 * POST /api/outreach/poll-all
 *
 * Polls Linq for new responses across ALL active chapters.
 * For any confirmed contacts found, immediately fires T2.
 * Lightweight — designed to run on a cron every 15 minutes.
 * Never calls Linq directly for sends — T2 fires via send-batch.
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

      // 3. If any confirmed contacts found, fire T2 immediately via send-batch
      const confirmedCount = pollResult.classifications['confirmed'] || 0;
      if (confirmedCount > 0 && chapter.alumni_join_link) {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://trailblaize.space';
        const t2Response = await fetch(`${baseUrl}/api/outreach/send-batch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.INTERNAL_API_KEY}`,
          },
          body: JSON.stringify({
            chapter_id: chapter.id,
            touch: 2,
            school: chapter.school,
            fraternity: chapter.fraternity,
            signup_link: chapter.alumni_join_link,
            batch_size: confirmedCount + 10,
          }),
        });

        if (t2Response.ok) {
          const t2Data = await t2Response.json();
          summary.t2_fired += t2Data.data?.sent || 0;
        }
      }
    } catch (err) {
      summary.errors.push(`${chapter.chapter_name}: ${String(err)}`);
    }
  }

  return NextResponse.json({ data: summary, error: null });
}
