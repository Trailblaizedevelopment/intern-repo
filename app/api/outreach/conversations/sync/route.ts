import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getMessages } from '@/lib/linq';
import { runSyncAll } from '../sync-all/route';

const AUTH_TOKEN = 'hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h';

const LINQ_LINE_PHONES = new Set(['+16462101111', '+16462178274', '+16462442696']);

/**
 * POST /api/outreach/conversations/sync
 *
 * Scans ALL contacts with linq_chat_id IS NOT NULL.
 * Fetches their Linq message thread. If any inbound message is found
 * (from ≠ our line phones), writes last_response_at + response_text.
 * Does NOT change outreach_status.
 *
 * Runs on-demand (triggered by "Sync" button or auto-mount) — not an auto-cron.
 * NEVER auto-replies. Just detects and records.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== AUTH_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  // Fetch ALL contacts with a linq_chat_id
  const { data: contacts, error } = await supabase
    .from('alumni_contacts')
    .select('id, outreach_status, linq_chat_id, assigned_line, touch1_sent_at')
    .not('linq_chat_id', 'is', null)
    .limit(500); // safety cap

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!contacts?.length) return NextResponse.json({ detected: 0, scanned: 0 });

  let detected = 0;
  const updates: { id: string; response_text: string; last_response_at: string }[] = [];
  const errors: string[] = [];

  // Process in parallel batches of 5
  const BATCH_SIZE = 5;
  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (contact) => {
      try {
        const msgs = await getMessages(contact.linq_chat_id!, 50);

        // Find most recent inbound message (from ≠ our lines)
        const inbound = msgs
          .filter(m => !LINQ_LINE_PHONES.has(m.from))
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        if (inbound.length > 0) {
          const latestReply = inbound[0];
          const text = latestReply.parts
            .filter(p => p.type === 'text')
            .map(p => p.value)
            .join(' ')
            .trim();

          updates.push({
            id: contact.id,
            response_text: text || '(media/no text)',
            last_response_at: latestReply.created_at,
          });
          detected++;
        }
      } catch (e) {
        errors.push(`${contact.id}: ${e}`);
      }
    }));
  }

  // Batch update detected contacts — only last_response_at and response_text
  for (const update of updates) {
    await supabase
      .from('alumni_contacts')
      .update({
        last_response_at: update.last_response_at,
        response_text: update.response_text,
      })
      .eq('id', update.id);
  }

  // ── Also run full chat-match sync (links existing Linq chats to alumni) ──
  let syncAllResults: { matched?: number; updated?: number; scanned?: number } = {};
  try {
    syncAllResults = await runSyncAll();
  } catch (e) {
    console.warn('[conversations/sync] sync-all failed (non-fatal):', e);
  }

  return NextResponse.json({
    detected,
    scanned: contacts.length,
    errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
    sync_all: syncAllResults,
  });
}
