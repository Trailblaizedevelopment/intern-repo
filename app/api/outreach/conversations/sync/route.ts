import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getMessages } from '@/lib/linq';

const AUTH_TOKEN = 'hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h';

const LINQ_LINE_PHONES = new Set(['+16462408056', '+16462668785', '+16462442696']);

/**
 * POST /api/outreach/conversations/sync
 *
 * Scans all contacts with outreach_status=touch1_sent + linq_chat_id.
 * Fetches their Linq message thread. If any inbound message is found
 * (from ≠ our line phones), marks contact as touch1_confirmed and
 * writes last_response_at + response_text.
 *
 * Runs on-demand (triggered by "Sync" button) — not an auto-cron.
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

  // Fetch contacts pending response detection
  // Includes touch1_sent contacts with a linq_chat_id
  const { data: contacts, error } = await supabase
    .from('alumni_contacts')
    .select('id, outreach_status, linq_chat_id, assigned_line, touch1_sent_at')
    .eq('outreach_status', 'touch1_sent')
    .not('linq_chat_id', 'is', null)
    .limit(500); // safety cap — at 28 right now, grows to ~2000 over time

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!contacts?.length) return NextResponse.json({ detected: 0, scanned: 0 });

  let detected = 0;
  const updates: { id: string; response_text: string; last_response_at: string }[] = [];
  const errors: string[] = [];

  for (const contact of contacts) {
    try {
      const msgs = await getMessages(contact.linq_chat_id!, 50);

      // Find first inbound message (from ≠ our lines)
      const inbound = msgs
        .filter(m => !LINQ_LINE_PHONES.has(m.from))
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      if (inbound.length > 0) {
        const firstReply = inbound[0];
        const text = firstReply.parts
          .filter(p => p.type === 'text')
          .map(p => p.value)
          .join(' ')
          .trim();

        updates.push({
          id: contact.id,
          response_text: text || '(media/no text)',
          last_response_at: firstReply.created_at,
        });
        detected++;
      }

      // Small delay to avoid hammering Linq API
      await new Promise(r => setTimeout(r, 150));
    } catch (e) {
      errors.push(`${contact.id}: ${e}`);
    }
  }

  // Batch update detected contacts
  for (const update of updates) {
    await supabase
      .from('alumni_contacts')
      .update({
        outreach_status: 'touch1_confirmed',
        last_response_at: update.last_response_at,
        response_text: update.response_text,
      })
      .eq('id', update.id);
  }

  return NextResponse.json({
    detected,
    scanned: contacts.length,
    errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
  });
}
