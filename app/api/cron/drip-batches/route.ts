import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET /api/cron/drip-batches
 *
 * Cron job: runs every 30 minutes, 11am–4pm CST (configured in vercel.json).
 * Finds all batches with status = 'approved' or 'executing' and processes
 * each in a chunk of 25 contacts.
 *
 * This drips sends over multiple cron runs, staying well within Vercel's
 * 300s timeout limit (25 contacts × ~9s max = ~225s worst case).
 *
 * Reports: batches in progress, total sends this run.
 *
 * Security: Vercel cron jobs call with CRON_SECRET header; fall back to
 * INTERNAL_API_SECRET if CRON_SECRET is not set.
 */

export const maxDuration = 300;

const CHUNK_SIZE = 25;
const AUTH_TOKEN = 'hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h';

// Vercel cron uses Authorization: Bearer <CRON_SECRET>
function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  // Accept our internal auth token OR the Vercel cron secret (if configured)
  const cronSecret = process.env.CRON_SECRET || '';
  return token === AUTH_TOKEN || (cronSecret !== '' && token === cronSecret);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Time gate: only run 11am–4pm CST (UTC-5 standard / UTC-6 daylight)
  // We check both UTC-5 and UTC-6 to handle DST transitions gracefully
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMin = now.getUTCMinutes();
  const utcDecimal = utcHour + utcMin / 60;

  // CST = UTC-6 (standard) | CDT = UTC-5 (daylight)
  // 11am CST = 17:00 UTC | 4pm CST = 22:00 UTC
  // 11am CDT = 16:00 UTC | 4pm CDT = 21:00 UTC
  // Allow 16:00–22:00 UTC to cover both CDT and CST windows
  const IN_WINDOW = utcDecimal >= 16.0 && utcDecimal < 22.0;

  if (!IN_WINDOW) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'Outside 11am–4pm CST window',
      utc_hour: utcHour,
      utc_min: utcMin,
    });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  // Find batches to process
  const { data: batches, error: batchErr } = await supabase
    .from('outreach_batches')
    .select('id, status, total_contacts, notes, scheduled_date')
    .in('status', ['approved', 'executing'])
    .order('created_at', { ascending: true });

  if (batchErr) {
    console.error('[drip-batches cron] fetch error:', batchErr);
    return NextResponse.json({ error: batchErr.message }, { status: 500 });
  }

  if (!batches || batches.length === 0) {
    return NextResponse.json({ ok: true, batches_processed: 0, total_sent: 0, message: 'No pending batches' });
  }

  const report: Array<{ id: string; sent: number; remaining: number; status: string; error?: string }> = [];
  let totalSent = 0;

  // Build the base URL for internal API calls
  const reqUrl = new URL(req.url);
  const baseUrl = `${reqUrl.protocol}//${reqUrl.host}`;

  for (const batch of batches) {
    try {
      const res = await fetch(`${baseUrl}/api/outreach/batches/${batch.id}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AUTH_TOKEN}`,
        },
        body: JSON.stringify({ chunk_size: CHUNK_SIZE }),
      });

      const json = await res.json();

      if (!res.ok) {
        report.push({ id: batch.id, sent: 0, remaining: -1, status: 'error', error: json.error || `HTTP ${res.status}` });
        continue;
      }

      const data = json.data || {};
      const sent = data.sent || 0;
      const remaining = data.remaining ?? -1;
      const newStatus = data.status || (remaining === 0 ? 'completed' : 'executing');

      totalSent += sent;
      report.push({ id: batch.id, sent, remaining, status: newStatus });
    } catch (e) {
      report.push({ id: batch.id, sent: 0, remaining: -1, status: 'error', error: String(e) });
    }
  }

  return NextResponse.json({
    ok: true,
    batches_processed: batches.length,
    total_sent: totalSent,
    chunk_size: CHUNK_SIZE,
    report,
    ran_at: now.toISOString(),
  });
}
