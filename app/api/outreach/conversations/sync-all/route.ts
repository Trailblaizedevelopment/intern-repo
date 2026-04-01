import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * POST /api/outreach/conversations/sync-all
 *
 * One-time + periodic sync that matches existing Linq chats to alumni_contacts.
 *
 * Problem solved:
 *   Alumni manually texted via Linq before the system existed have
 *   linq_chat_id = null and outreach_status = 'not_contacted' even though
 *   conversations exist. This sync fixes that to prevent re-texting.
 *
 * Steps:
 *   1. Paginate through ALL Linq chats (GET /partner/v3/chats)
 *   2. Extract recipient phone from chat.recipient_phone or chat.participants/handles
 *   3. Look up alumni_contacts by phone_primary (E.164 normalized)
 *   4. If match AND linq_chat_id is null: set linq_chat_id, update outreach_status
 *   5. If match AND inbound replies exist: set last_response_at, response_classification
 *   6. Report matched / updated / skipped
 */

const LINQ_API_TOKEN = 'df4759ea-f49d-4ca8-bbc6-6c93a25ecc7d';
const LINQ_BASE = 'https://api.linqapp.com/api/partner/v3';
const AUTH_TOKEN = 'hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h';

// Our own Linq line phones — used to identify "outbound" vs "inbound" messages
const OUR_LINE_PHONES = new Set(['+16462101111', '+16462178274', '+16462442696']);

/** Normalize phone to E.164 (+1XXXXXXXXXX) */
function normalizeE164(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length > 7) return `+${digits}`;
  return phone;
}

interface LinqHandle {
  handle: string;
  id?: string;
  is_me?: boolean;
  service?: string;
  status?: string;
}

interface LinqChatItem {
  id: string;
  handles?: LinqHandle[];
  participants?: Array<{ phone?: string; handle?: string; is_me?: boolean }>;
  recipient_phone?: string;
  messages?: Array<{
    from?: string;
    is_from_me?: boolean;
    created_at?: string;
    parts?: Array<{ type: string; value: string }>;
  }>;
  last_message?: {
    from?: string;
    is_from_me?: boolean;
    created_at?: string;
  };
  updated_at?: string;
  created_at?: string;
  service?: string;
}

/** Extract the recipient (non-us) phone number from a Linq chat object */
function extractRecipientPhone(chat: LinqChatItem): string | null {
  // Option 1: explicit field
  if (chat.recipient_phone) return normalizeE164(chat.recipient_phone);

  // Option 2: handles array (standard Linq v3 format)
  if (chat.handles && Array.isArray(chat.handles)) {
    const recipient = chat.handles.find(h => !h.is_me);
    if (recipient?.handle) return normalizeE164(recipient.handle);
  }

  // Option 3: participants array
  if (chat.participants && Array.isArray(chat.participants)) {
    const recipient = chat.participants.find(p => !p.is_me);
    if (recipient?.phone) return normalizeE164(recipient.phone);
    if (recipient?.handle) return normalizeE164(recipient.handle);
  }

  return null;
}

/** Check if a chat has any inbound (from recipient) messages */
function hasInboundMessages(chat: LinqChatItem): { has_inbound: boolean; last_inbound_at: string | null; last_text: string | null } {
  const messages = chat.messages || [];
  const inbound = messages.filter(m => {
    if (m.is_from_me === false) return true;
    if (m.from && !OUR_LINE_PHONES.has(normalizeE164(m.from))) return true;
    return false;
  });

  if (inbound.length === 0) {
    return { has_inbound: false, last_inbound_at: null, last_text: null };
  }

  const sorted = [...inbound].sort((a, b) =>
    new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );

  const latest = sorted[0];
  const text = (latest.parts || [])
    .filter(p => p.type === 'text')
    .map(p => p.value)
    .join(' ')
    .trim() || null;

  return { has_inbound: true, last_inbound_at: latest.created_at || null, last_text: text };
}

/** Paginate through all Linq chats */
async function fetchAllLinqChats(): Promise<LinqChatItem[]> {
  const allChats: LinqChatItem[] = [];
  let cursor: string | null = null;
  let page = 0;
  const MAX_PAGES = 50; // safety limit: 50 × 100 = 5000 chats max

  while (page < MAX_PAGES) {
    const params = new URLSearchParams({ limit: '100' });
    if (cursor) params.set('cursor', cursor);

    const res = await fetch(`${LINQ_BASE}/chats?${params}`, {
      headers: { 'Authorization': `Token ${LINQ_API_TOKEN}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Linq GET /chats failed (${res.status}): ${text}`);
    }

    const json = await res.json();
    const chats: LinqChatItem[] = Array.isArray(json) ? json : (json.chats || json.data || []);
    allChats.push(...chats);

    // Check for next page
    const nextCursor = json.next_cursor || json.cursor?.next || null;
    if (!nextCursor || chats.length === 0) break;

    cursor = nextCursor;
    page++;
  }

  return allChats;
}

export async function runSyncAll(): Promise<{
  scanned: number;
  matched: number;
  updated: number;
  skipped: number;
  errors: string[];
}> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('DB not configured');

  const results = { scanned: 0, matched: 0, updated: 0, skipped: 0, errors: [] as string[] };

  // ── 1. Fetch all Linq chats ───────────────────────────────────────────────
  const allChats = await fetchAllLinqChats();
  results.scanned = allChats.length;

  if (allChats.length === 0) return results;

  // ── 2. Build phone → alumni_contact lookup ────────────────────────────────
  // Fetch all contacts (only the fields we need for matching)
  const { data: allContacts, error: contactsErr } = await supabase
    .from('alumni_contacts')
    .select('id, phone_primary, linq_chat_id, outreach_status, last_response_at, response_classification')
    .not('phone_primary', 'is', null);

  if (contactsErr) throw new Error(`Failed to fetch alumni_contacts: ${contactsErr.message}`);

  // Build normalized phone → contact map
  const phoneToContact = new Map<string, {
    id: string;
    phone_primary: string;
    linq_chat_id: string | null;
    outreach_status: string;
    last_response_at: string | null;
    response_classification: string | null;
  }>();

  for (const c of allContacts || []) {
    if (c.phone_primary) {
      const norm = normalizeE164(c.phone_primary);
      phoneToContact.set(norm, c);
    }
  }

  // ── 3. Match and update ───────────────────────────────────────────────────
  for (const chat of allChats) {
    const recipientPhone = extractRecipientPhone(chat);
    if (!recipientPhone) {
      results.skipped++;
      continue;
    }

    const contact = phoneToContact.get(recipientPhone);
    if (!contact) {
      results.skipped++;
      continue;
    }

    results.matched++;
    const inboundInfo = hasInboundMessages(chat);
    const updates: Record<string, unknown> = {};

    // Update linq_chat_id if not set
    if (!contact.linq_chat_id) {
      updates.linq_chat_id = chat.id;

      // If chat exists at all, they were contacted — bump to touch1_sent
      if (contact.outreach_status === 'not_contacted') {
        updates.outreach_status = 'touch1_sent';
      }
    }

    // If they replied, record the response
    if (inboundInfo.has_inbound && inboundInfo.last_inbound_at) {
      // Update last_response_at if this is newer or not set
      const existingTs = contact.last_response_at ? new Date(contact.last_response_at).getTime() : 0;
      const newTs = new Date(inboundInfo.last_inbound_at).getTime();

      if (newTs > existingTs) {
        updates.last_response_at = inboundInfo.last_inbound_at;
        if (inboundInfo.last_text) {
          updates.response_text = inboundInfo.last_text;
        }
      }

      // Set response_classification if null
      if (!contact.response_classification) {
        updates.response_classification = 'replied';
      }
    }

    if (Object.keys(updates).length === 0) {
      results.skipped++;
      continue;
    }

    try {
      const { error: updateErr } = await supabase
        .from('alumni_contacts')
        .update(updates)
        .eq('id', contact.id);

      if (updateErr) {
        results.errors.push(`${contact.id}: ${updateErr.message}`);
      } else {
        results.updated++;
      }
    } catch (e) {
      results.errors.push(`${contact.id}: ${String(e)}`);
    }
  }

  return results;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== AUTH_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = await runSyncAll();
    return NextResponse.json({ ...results, ok: true });
  } catch (err) {
    console.error('[sync-all] error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
