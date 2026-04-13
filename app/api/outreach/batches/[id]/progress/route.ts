import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/outreach/batches/[id]/progress
 *
 * Returns live execution progress for a batch.
 * Designed to be polled every 3s by the UI while status is 'executing'.
 *
 * Response shape:
 *   {
 *     status: string,          // current batch status
 *     progress: {
 *       sent: number,
 *       total: number,
 *       failed: number,
 *       pct: number,           // 0–100
 *     } | null,
 *   }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const { data: batch, error } = await supabase
    .from('outreach_batches')
    .select('id, status, batch_progress, total_contacts')
    .eq('id', id)
    .single();

  if (error || !batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });

  // batch_progress is a JSON column: { sent, total, failed }
  // Fall back to total_contacts when progress hasn't been written yet
  let progress: { sent: number; total: number; failed: number; pct: number } | null = null;
  if (batch.batch_progress) {
    const p = batch.batch_progress as { sent?: number; total?: number; failed?: number };
    const sent   = p.sent   ?? 0;
    const total  = p.total  ?? batch.total_contacts ?? 0;
    const failed = p.failed ?? 0;
    const pct    = total > 0 ? Math.round((sent / total) * 100) : 0;
    progress = { sent, total, failed, pct };
  } else if (batch.total_contacts) {
    progress = { sent: 0, total: batch.total_contacts, failed: 0, pct: 0 };
  }

  return NextResponse.json({ status: batch.status, progress });
}
