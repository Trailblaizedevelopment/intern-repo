import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/chapters/[id]/activity
 *
 * Returns a merged, time-sorted activity log for a chapter.
 * Sources:
 *   - outreach_batches  → batch events (compiled, approved, executed)
 *   - payments          → payment received events
 *   - chapter_check_ins → check-in events
 *
 * Query params:
 *   limit  (default 50, max 100)
 */

export type ActivityEventKind =
  | 'batch_compiled'
  | 'batch_approved'
  | 'batch_executed'
  | 'payment_received'
  | 'check_in';

export interface ActivityEvent {
  id: string;
  kind: ActivityEventKind;
  title: string;
  detail?: string;
  timestamp: string; // ISO
  meta?: Record<string, unknown>;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: chapterId } = await params;
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return NextResponse.json(
      { data: null, error: { message: 'Database not configured', code: 'DB_ERROR' } },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

  try {
    const [batchesRes, paymentsRes, checkInsRes] = await Promise.all([
      supabase
        .from('outreach_batches')
        .select('id, status, created_at, scheduled_date, total_contacts, touch_breakdown, notes, chapter_id')
        .eq('chapter_id', chapterId)
        .order('created_at', { ascending: false })
        .limit(50),

      supabase
        .from('payments')
        .select('id, amount, payment_date, status, payment_method, notes, created_at')
        .eq('chapter_id', chapterId)
        .order('payment_date', { ascending: false })
        .limit(50),

      supabase
        .from('chapter_check_ins')
        .select('id, check_in_date, notes, health_score, created_by, created_at')
        .eq('chapter_id', chapterId)
        .order('check_in_date', { ascending: false })
        .limit(50),
    ]);

    const events: ActivityEvent[] = [];

    // ── Outreach batches ────────────────────────────────────────────────────
    for (const b of batchesRes.data ?? []) {
      const contacts = b.total_contacts ? `${b.total_contacts} contacts` : '';
      const breakdown = b.touch_breakdown as Record<string, number> | null;
      const touchStr = breakdown
        ? Object.entries(breakdown)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => `${v} ${k.toUpperCase()}`)
            .join(', ')
        : '';

      // compiled = created_at
      events.push({
        id: `batch_compiled_${b.id}`,
        kind: 'batch_compiled',
        title: 'Outreach batch compiled',
        detail: [contacts, touchStr].filter(Boolean).join(' · '),
        timestamp: b.created_at,
        meta: { batch_id: b.id, status: b.status, scheduled_date: b.scheduled_date },
      });

      // approved (status = approved | executed)
      if (b.status === 'approved' || b.status === 'executed' || b.status === 'completed') {
        // We don't have a separate approved_at timestamp, so use scheduled_date as proxy
        const approvedAt = b.scheduled_date
          ? new Date(b.scheduled_date).toISOString()
          : b.created_at;
        events.push({
          id: `batch_approved_${b.id}`,
          kind: 'batch_approved',
          title: 'Outreach batch approved',
          detail: b.scheduled_date
            ? `Scheduled ${new Date(b.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
            : undefined,
          timestamp: approvedAt,
          meta: { batch_id: b.id },
        });
      }

      // executed
      if (b.status === 'executed' || b.status === 'completed') {
        events.push({
          id: `batch_executed_${b.id}`,
          kind: 'batch_executed',
          title: 'Outreach batch executed',
          detail: contacts,
          timestamp: b.scheduled_date
            ? new Date(new Date(b.scheduled_date).getTime() + 1000).toISOString()
            : b.created_at,
          meta: { batch_id: b.id, contacts: b.total_contacts },
        });
      }
    }

    // ── Payments ────────────────────────────────────────────────────────────
    for (const p of paymentsRes.data ?? []) {
      if (p.status !== 'completed') continue;
      events.push({
        id: `payment_${p.id}`,
        kind: 'payment_received',
        title: 'Payment received',
        detail: `$${Number(p.amount).toLocaleString()} via ${p.payment_method?.replace('_', ' ') ?? 'unknown'}${p.notes ? ` · ${p.notes}` : ''}`,
        timestamp: p.payment_date
          ? new Date(p.payment_date).toISOString()
          : p.created_at,
        meta: { payment_id: p.id, amount: p.amount, method: p.payment_method },
      });
    }

    // ── Check-ins ───────────────────────────────────────────────────────────
    for (const ci of checkInsRes.data ?? []) {
      events.push({
        id: `checkin_${ci.id}`,
        kind: 'check_in',
        title: 'Check-in completed',
        detail: [
          ci.health_score ? `Health: ${ci.health_score.replace('_', ' ')}` : null,
          ci.notes ? ci.notes.slice(0, 80) + (ci.notes.length > 80 ? '…' : '') : null,
        ]
          .filter(Boolean)
          .join(' · ') || undefined,
        timestamp: ci.check_in_date
          ? new Date(ci.check_in_date).toISOString()
          : ci.created_at,
        meta: { check_in_id: ci.id, health_score: ci.health_score, created_by: ci.created_by },
      });
    }

    // ── Sort descending by timestamp, trim to limit ──────────────────────────
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const trimmed = events.slice(0, limit);

    return NextResponse.json({ data: trimmed, error: null });
  } catch (err) {
    console.error('[GET /api/chapters/[id]/activity]', err);
    return NextResponse.json(
      { data: null, error: { message: 'Server error', code: 'SERVER_ERROR' } },
      { status: 500 }
    );
  }
}
