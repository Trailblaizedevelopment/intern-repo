/**
 * lib/linq-recovery.ts
 * Full Linq conversation recovery: pulls all chats across all lines,
 * matches to alumni_contacts, upserts linq_conversations, backfills linq_chat_id.
 *
 * Server-side only — never import from client components.
 */

import { createClient } from '@supabase/supabase-js';
import { listChats, getMessages, LinqChat, LinqMessage } from '@/lib/linq';

// ── Line config (source of truth for line locking) ─────────────────────────
export const LINQ_LINES: { phone: string; label: string }[] = [
  { phone: '+16462101111', label: 'Owen' },
  { phone: '+16462668785', label: 'Adam' },
  { phone: '+16462442696', label: 'Ford' },
];

export interface LinqConversation {
  id: string;
  linq_chat_id: string;
  contact_id: string | null;
  line_phone: string;
  line_label: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  chapter_id: string | null;
  chapter_name: string | null;
  outreach_status: string | null;
  touch_stage: string | null;
  status: 'active' | 'handled' | 'flagged' | 'archived';
  flagged_reason: string | null;
  last_message_at: string | null;
  last_message_text: string | null;
  last_message_direction: 'inbound' | 'outbound' | null;
  has_unread_reply: boolean;
  is_urgent: boolean;
  created_at: string;
  updated_at: string;
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

function getLinqToken(): string {
  const token = process.env.LINQ_API_TOKEN;
  if (!token) throw new Error('LINQ_API_TOKEN not set');
  return token;
}

/** Fetch all chats for a given line phone, paginating fully. */
async function fetchAllChatsForLine(phone: string): Promise<LinqChat[]> {
  const all: LinqChat[] = [];
  let cursor: string | undefined;
  do {
    const page = await listChats(phone, 150, cursor);
    all.push(...page.chats);
    cursor = page.next_cursor;
  } while (cursor);
  return all;
}

/** Get the last message for a chat. Returns null if no messages. */
async function getLastMessage(chatId: string): Promise<LinqMessage | null> {
  try {
    const msgs = await getMessages(chatId, 1);
    return msgs.length > 0 ? msgs[0] : null;
  } catch {
    return null;
  }
}

export interface RecoveryResult {
  totalChats: number;
  upserted: number;
  backfilled: number;
  errors: string[];
  lineBreakdown: Record<string, number>;
}

/**
 * Main recovery function. Pulls all chats across all lines,
 * enriches with contact data from Supabase, upserts linq_conversations.
 */
export async function runLinqRecovery(): Promise<RecoveryResult> {
  const supabase = getSupabaseAdmin();
  const errors: string[] = [];
  const lineBreakdown: Record<string, number> = {};
  let totalChats = 0;
  let upserted = 0;
  let backfilled = 0;

  // ── Step 1: Fetch all chats across all lines ───────────────────────────
  const allChats: Array<{ chat: LinqChat; line: typeof LINQ_LINES[number] }> = [];

  await Promise.allSettled(
    LINQ_LINES.map(async line => {
      try {
        const chats = await fetchAllChatsForLine(line.phone);
        lineBreakdown[line.label] = chats.length;
        for (const chat of chats) {
          allChats.push({ chat, line });
        }
      } catch (err) {
        errors.push(`Failed to fetch chats for ${line.label}: ${String(err)}`);
        lineBreakdown[line.label] = 0;
      }
    })
  );

  totalChats = allChats.length;

  if (allChats.length === 0) {
    return { totalChats: 0, upserted: 0, backfilled: 0, errors, lineBreakdown };
  }

  // ── Step 2: Collect all recipient phones ──────────────────────────────
  const recipientPhones = [
    ...new Set(
      allChats.flatMap(({ chat }) =>
        chat.handles.filter(h => !h.is_me).map(h => h.handle)
      ).filter(Boolean)
    ),
  ];

  // ── Step 3: Batch lookup alumni_contacts ──────────────────────────────
  type ContactRow = {
    id: string;
    first_name: string;
    last_name: string;
    phone_primary: string | null;
    phone_secondary: string | null;
    chapter_id: string | null;
    outreach_status: string | null;
    touch_stage: string | null;
  };
  let contacts: ContactRow[] = [];

  if (recipientPhones.length > 0) {
    const orClauses = recipientPhones
      .map(p => `phone_primary.eq.${p},phone_secondary.eq.${p}`)
      .join(',');
    const { data, error } = await supabase
      .from('alumni_contacts')
      .select('id, first_name, last_name, phone_primary, phone_secondary, chapter_id, outreach_status, touch_stage')
      .or(orClauses);
    if (error) {
      errors.push(`Contact lookup failed: ${error.message}`);
    } else {
      contacts = (data || []) as ContactRow[];
    }
  }

  const phoneToContact = new Map<string, ContactRow>();
  for (const c of contacts) {
    if (c.phone_primary) phoneToContact.set(c.phone_primary, c);
    if (c.phone_secondary) phoneToContact.set(c.phone_secondary, c);
  }

  // ── Step 4: Fetch chapter names ────────────────────────────────────────
  const chapterIds = [...new Set(contacts.map(c => c.chapter_id).filter(Boolean))] as string[];
  const chapterMap = new Map<string, string>();
  if (chapterIds.length > 0) {
    const { data: chapters } = await supabase
      .from('chapters')
      .select('id, chapter_name')
      .in('id', chapterIds);
    for (const ch of chapters || []) chapterMap.set(ch.id, ch.chapter_name);
  }

  // ── Step 5: Upsert linq_conversations in batches ──────────────────────
  const BATCH = 50;
  const rows: Record<string, unknown>[] = [];

  for (const { chat, line } of allChats) {
    const recipientHandle = chat.handles.find(h => !h.is_me);
    const phone = recipientHandle?.handle || null;
    const contact = phone ? (phoneToContact.get(phone) ?? null) : null;

    // Try to get last message from chat updated_at — we'll set last_message_at
    // from the chat's updated_at as a proxy (avoid N+1 for recovery; sync route does detail)
    const now48hAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const isUrgent = false; // set during sync, not recovery

    rows.push({
      linq_chat_id: chat.id,
      contact_id: contact?.id ?? null,
      line_phone: line.phone,
      line_label: line.label,
      contact_name: contact
        ? `${contact.first_name} ${contact.last_name}`.trim()
        : null,
      contact_phone: phone,
      chapter_id: contact?.chapter_id ?? null,
      chapter_name: contact?.chapter_id
        ? (chapterMap.get(contact.chapter_id) ?? null)
        : null,
      outreach_status: contact?.outreach_status ?? null,
      touch_stage: contact?.touch_stage ?? null,
      last_message_at: chat.updated_at,
      is_urgent: isUrgent,
      updated_at: new Date().toISOString(),
    });
  }

  // Batch upsert
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from('linq_conversations')
      .upsert(batch, { onConflict: 'linq_chat_id', ignoreDuplicates: false });
    if (error) {
      errors.push(`Upsert batch ${Math.floor(i / BATCH) + 1} failed: ${error.message}`);
    } else {
      upserted += batch.length;
    }
  }

  // ── Step 6: Backfill alumni_contacts.linq_chat_id where null ──────────
  for (const { chat, line: _line } of allChats) {
    const recipientHandle = chat.handles.find(h => !h.is_me);
    const phone = recipientHandle?.handle || null;
    const contact = phone ? (phoneToContact.get(phone) ?? null) : null;
    if (!contact) continue;

    // Only backfill if not already set
    const { data: existing } = await supabase
      .from('alumni_contacts')
      .select('linq_chat_id')
      .eq('id', contact.id)
      .single();

    if (existing && !existing.linq_chat_id) {
      const { error } = await supabase
        .from('alumni_contacts')
        .update({ linq_chat_id: chat.id })
        .eq('id', contact.id);
      if (!error) backfilled++;
    }
  }

  return { totalChats, upserted, backfilled, errors, lineBreakdown };
}
