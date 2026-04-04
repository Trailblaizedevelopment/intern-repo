import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/chapters/triage
 *
 * Returns all chapters sorted by urgency with computed health scores.
 * Merges chapter data with alumni pipeline stats.
 *
 * Health score logic (0–100):
 *   - Payment current: +30
 *   - Onboarding complete: +20
 *   - Outreach coverage ≥ 50%: +20, ≥ 25%: +10
 *   - Last check-in within 14 days: +15, within 30 days: +8
 *   - Signups > 0: +10, > 10: +15
 *   - Instagram flyer posted: +5
 *
 * Sort: RED (0–39) first → YELLOW (40–69) → GREEN (70–100)
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json(
        { data: null, error: { message: 'Database not configured', code: 'DB_NOT_CONFIGURED' } },
        { status: 500 }
      );
    }

    // Fetch all chapters — include onboarding step keys + instagram_flyer_posted for real health/completion calcs
    const { data: chapters, error: chapError } = await supabase
      .from('chapters')
      .select(`
        id, chapter_name, school, fraternity, status, health,
        payment_amount, payment_type, last_payment_date, next_payment_date,
        last_check_in_date, next_check_in_date, check_in_frequency,
        onboarding_completed, next_action, notes,
        active_members, estimated_alumni, created_at,
        contact_name, contact_email, contact_phone,
        mrr, payment_day,
        wizard_step, wizard_completed_at,
        instagram_flyer_posted,
        setup_groupchat_created, setup_chapter_on_space, setup_chapter_on_platform,
        setup_submission_form_sent, setup_submission_received,
        activate_ig_collab, activate_ig_flyer, activate_facebook_flyer,
        activate_linkedin_post, activate_groupme_blast, activate_newsletter,
        data_list_uploaded, data_counts_verified, data_imessage_filtered,
        linq_touch1_sent, linq_touch2_sent, linq_touch3_sent, linq_100_signups,
        email_sequence_live, email_blast_sent,
        success_first_checkin, success_actives_list, success_first_match, success_video_sent
      `)
      .order('chapter_name', { ascending: true });

    if (chapError) {
      return NextResponse.json(
        { data: null, error: { message: chapError.message, code: chapError.code } },
        { status: 500 }
      );
    }

    if (!chapters || chapters.length === 0) {
      return NextResponse.json({ data: [], error: null });
    }

    // Bulk-fetch alumni stats for all chapters in a single query (avoids N×4 queries)
    const chapterIds = chapters.map((ch) => ch.id);
    const { data: allContacts, error: contactsError } = await supabase
      .from('alumni_contacts')
      .select('chapter_id, phone_primary, outreach_status')
      .in('chapter_id', chapterIds);

    if (contactsError) {
      return NextResponse.json(
        { data: null, error: { message: contactsError.message, code: contactsError.code } },
        { status: 500 }
      );
    }

    // Compute per-chapter stats in JS (O(contacts), no extra DB round-trips)
    const statsMap: Record<string, {
      chapter_id: string;
      total: number;
      have_phone: number;
      contacted_with_phone: number;
      signed_up: number;
      outreach_coverage_pct: number;
    }> = {};

    for (const chId of chapterIds) {
      statsMap[chId] = { chapter_id: chId, total: 0, have_phone: 0, contacted_with_phone: 0, signed_up: 0, outreach_coverage_pct: 0 };
    }

    for (const c of allContacts ?? []) {
      const s = statsMap[c.chapter_id];
      if (!s) continue;
      s.total++;
      if (c.phone_primary) {
        s.have_phone++;
        if (c.outreach_status && c.outreach_status !== 'not_contacted') s.contacted_with_phone++;
      }
      if (c.outreach_status === 'signed_up') s.signed_up++;
    }

    for (const s of Object.values(statsMap)) {
      s.outreach_coverage_pct = s.have_phone > 0
        ? Math.round((s.contacted_with_phone / s.have_phone) * 100)
        : 0;
    }


    const now = Date.now();

    // Compute health scores and triage tier
    const enriched = chapters.map((ch) => {
      const stats = statsMap[ch.id] || { total: 0, have_phone: 0, contacted_with_phone: 0, signed_up: 0, outreach_coverage_pct: 0 };

      let score = 0;

      // Payment (30 pts)
      if (ch.next_payment_date) {
        const payDue = new Date(ch.next_payment_date).getTime();
        if (payDue > now) score += 30;
        else if ((now - payDue) < 7 * 86400000) score += 15; // overdue < 7 days
        // else 0 — overdue
      } else if (ch.status === 'active') {
        // Active but no payment date set — neutral
        score += 15;
      }

      // Onboarding complete (20 pts)
      if (ch.onboarding_completed) score += 20;

      // Outreach coverage (20 pts)
      const cov = stats.outreach_coverage_pct;
      if (cov >= 50) score += 20;
      else if (cov >= 25) score += 10;
      else if (cov > 0) score += 5;

      // Last check-in (15 pts)
      if (ch.last_check_in_date) {
        const daysSince = Math.floor((now - new Date(ch.last_check_in_date).getTime()) / 86400000);
        if (daysSince <= 14) score += 15;
        else if (daysSince <= 30) score += 8;
        else if (daysSince <= 60) score += 3;
      }

      // Signups (15 pts)
      if (stats.signed_up >= 10) score += 15;
      else if (stats.signed_up > 0) score += 10;

      // Instagram flyer posted (5 pts)
      if (ch.instagram_flyer_posted) score += 5;

      // Clamp to 0–100
      score = Math.max(0, Math.min(100, score));

      // Triage tier
      let triage_tier: 'red' | 'yellow' | 'green';
      if (score < 40) triage_tier = 'red';
      else if (score < 70) triage_tier = 'yellow';
      else triage_tier = 'green';

      // Days since last activity
      const days_since_last_activity = ch.last_check_in_date
        ? Math.floor((now - new Date(ch.last_check_in_date).getTime()) / 86400000)
        : null;

      // Onboarding completion pct — compute from all 25 ONBOARDING_STEPS keys
      const ONBOARDING_STEP_KEYS = [
        'setup_groupchat_created', 'setup_chapter_on_space', 'setup_chapter_on_platform',
        'setup_submission_form_sent', 'setup_submission_received',
        'activate_ig_collab', 'activate_ig_flyer', 'activate_facebook_flyer',
        'activate_linkedin_post', 'activate_groupme_blast', 'activate_newsletter',
        'data_list_uploaded', 'data_counts_verified', 'data_imessage_filtered',
        'linq_touch1_sent', 'linq_touch2_sent', 'linq_touch3_sent', 'linq_100_signups',
        'email_sequence_live', 'email_blast_sent',
        'success_first_checkin', 'success_actives_list', 'success_first_match', 'success_video_sent',
      ] as const;
      const completedSteps = ONBOARDING_STEP_KEYS.filter(k => (ch as Record<string, unknown>)[k]).length;
      const onboarding_completion_pct = Math.round((completedSteps / ONBOARDING_STEP_KEYS.length) * 100);

      // Next required action (surface the most urgent)
      let next_required_action = ch.next_action || null;
      if (!next_required_action) {
        if (triage_tier === 'red' && ch.status === 'active' && !ch.last_check_in_date) {
          next_required_action = 'Schedule first check-in';
        } else if (stats.total === 0) {
          next_required_action = 'Upload alumni list';
        } else if (stats.outreach_coverage_pct === 0) {
          next_required_action = 'Start alumni outreach';
        }
      }

      return {
        ...ch,
        health_score: score,
        triage_tier,
        days_since_last_activity,
        onboarding_completion_pct,
        next_required_action,
        alumni_stats: stats,
      };
    });

    // Sort: RED first → YELLOW → GREEN, then by score ascending within tier
    const TIER_ORDER = { red: 0, yellow: 1, green: 2 };
    enriched.sort((a, b) => {
      const tierDiff = TIER_ORDER[a.triage_tier] - TIER_ORDER[b.triage_tier];
      if (tierDiff !== 0) return tierDiff;
      return a.health_score - b.health_score; // lowest score (worst) first within tier
    });

    return NextResponse.json({ data: enriched, error: null });
  } catch (err) {
    console.error('[GET /api/chapters/triage] Error:', err);
    return NextResponse.json(
      { data: null, error: { message: 'Internal server error', code: 'INTERNAL_ERROR' } },
      { status: 500 }
    );
  }
}
