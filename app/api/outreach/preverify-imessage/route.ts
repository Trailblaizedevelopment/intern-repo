import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { createChat, getChat, getRecipientService, sleep } from '@/lib/linq';

/**
 * POST /api/outreach/preverify-imessage
 *
 * Nightly cron endpoint — pre-verifies iMessage status for not_contacted alumni
 * before they enter the outreach batch. This prevents sending T1 messages to SMS
 * numbers by identifying them ahead of time.
 *
 * Uses Ford's line (+16462442696) — least active, saves Owen's line for real sends.
 *
 * Flow:
 *   1. Query up to 500 alumni_contacts WHERE is_imessage IS NULL
 *      AND outreach_status = 'not_contacted' AND phone_primary IS NOT NULL
 *   2. Create an empty Linq chat per contact (no message — service detection only)
 *   3. Batch 10 contacts at a time, wait 8s per batch for async resolution
 *   4. GET each chat, read resolved service type, update is_imessage + linq_chat_id
 *   5. Return summary counts
 *
 * Auth: Authorization: Bearer <PREVERIFY_CRON_SECRET>
 */

const PREVERIFY_LINE_PHONE = '+16462442696'; // Ford's line
const PREVERIFY_SECRET     = 'hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h';
const BATCH_SIZE           = 10;
const BATCH_WAIT_MS        = 8000;
const PER_CONTACT_SLEEP_MS = 500; // small gap between createChat calls within a batch

export async function POST(req: NextRequest) {
  // Auth check
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== PREVERIFY_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 500 });

  const counts = { verified: 0, imessage: 0, sms: 0, errors: 0 };

  // 1. Fetch contacts needing verification
  const { data: contacts, error: fetchErr } = await supabase
    .from('alumni_contacts')
    .select('id, phone_primary')
    .is('is_imessage', null)
    .eq('outreach_status', 'not_contacted')
    .not('phone_primary', 'is', null)
    .limit(500);

  if (fetchErr) {
    console.error('[preverify] fetch error:', fetchErr);
    return NextResponse.json({ error: String(fetchErr) }, { status: 500 });
  }

  if (!contacts || contacts.length === 0) {
    return NextResponse.json({ ...counts, message: 'No contacts to verify' });
  }

  // Process contacts in batches of BATCH_SIZE
  for (let batchStart = 0; batchStart < contacts.length; batchStart += BATCH_SIZE) {
    const batch = contacts.slice(batchStart, batchStart + BATCH_SIZE);

    // Phase 1: create empty chats (no message — service detection only)
    const createdChats: { contactId: string; chatId: string }[] = [];
    for (const contact of batch) {
      try {
        const chat = await createChat(PREVERIFY_LINE_PHONE, contact.phone_primary!, undefined);
        createdChats.push({ contactId: contact.id, chatId: chat.id });
        await sleep(PER_CONTACT_SLEEP_MS);
      } catch (e) {
        console.error(`[preverify] createChat failed for contact ${contact.id}:`, e);
        counts.errors++;
      }
    }

    // Phase 2: wait for Linq to resolve service asynchronously
    if (createdChats.length > 0) {
      await sleep(BATCH_WAIT_MS);

      // Phase 3: get each chat, read service type, update DB
      for (const { contactId, chatId } of createdChats) {
        try {
          const resolvedChat = await getChat(chatId);
          const service = getRecipientService(resolvedChat);
          const isImessage = service === 'iMessage' || service === 'RCS';

          await supabase
            .from('alumni_contacts')
            .update({
              is_imessage: isImessage,
              linq_chat_id: chatId,
            })
            .eq('id', contactId);

          counts.verified++;
          if (isImessage) counts.imessage++;
          else counts.sms++;

          await sleep(100);
        } catch (e) {
          console.error(`[preverify] getChat failed for chat ${chatId}:`, e);
          counts.errors++;
        }
      }
    }
  }

  console.log('[preverify] complete:', counts);
  return NextResponse.json(counts);
}
