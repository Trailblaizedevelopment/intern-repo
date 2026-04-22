/**
 * lib/linq-recovery.ts
 * Full Linq conversation recovery: pulls ALL chats across all lines (full pagination),
 * fetches last messages to populate content fields, matches to alumni_contacts,
 * and upserts linq_conversations.
 *
 * Server-side only — never import from client components.
 */

import { createClient } from '@supabase/supabase-js';
import { listChats, getMessages, LinqChat, LinqMessage } from '@/lib/linq';

// ── Line config — all 9 active lines ──────────────────────────────────────
export const LINQ_LINES: { phone: string; label: string }[] = [
  { phone: '+16462101111', label: 'Owen' },
  { phone: '+16462178274', label: 'Adam' },
  { phone: '+16462442696', label: 'Ford' },
  { phone: '+14044239427', label: 'Line 4' },
  { phone: '+14045428435', label: 'Line 5' },
  { phone: '+19725590427', label: 'Line 6' },
  { phone: '+19725590438', label: 'Line 7' },
  { phone: '+15042234218', label: 'Line 8' },
  { phone: '+15042236050', label: 'Line 9' },
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

/** Run concurrently in batches to respect rate limits. */
async function runInBatches<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<Array<{ status: 'fulfilled'; value: R } | { status: 'rejected'; reason: unknown }>> {
  const results: Array<{ status: 'fulfilled'; value: R } | { status: 'rejected'; reason: unknown }> = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

export interface RecoveryResult {
  totalChats: number;
  upserted: number;
  backfilled: number;
  errors: string[];
  lineBreakdown: Record<string, number>;
}

/**
 * Main recovery function. Pulls ALL chats across all lines with full pagination,
 * fetches last messages for each chat, enriches with contact data, upserts
 * linq_conversations.
 */
export async function runLinqRecovery(): Promise<RecoveryResult> {
  const supabase = getSupabaseAdmin();
  const errors: string[] = [];
  const lineBreakdown: Record<string, number> = {};
  let totalChats = 0;
  let upserted = 0;
  let backfilled = 0;

  // ── Step 1: Fetch ALL chats across all lines (full pagination) ─────────
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
  };
  let contacts: ContactRow[] = [];

  if (recipientPhones.length > 0) {
    const PHONE_BATCH = 50;
    for (let i = 0; i < recipientPhones.length; i += PHONE_BATCH) {
      const batch = recipientPhones.slice(i, i + PHONE_BATCH);
      const orClauses = batch
        .map(p => `phone_primary.eq.${p},phone_secondary.eq.${p}`)
        .join(',');
      const { data, error } = await supabase
        .from('alumni_contacts')
        .select('id, first_name, last_name, phone_primary, phone_secondary, chapter_id, outreach_status')
        .or(orClauses);
      if (error) {
        errors.push(`Contact lookup batch failed: ${error.message}`);
      } else {
        contacts.push(...((data || []) as ContactRow[]));
      }
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

  // ── Step 5: Fetch last messages for each chat (batched, 15 concurrent) ─
  // This is the critical fix — without this, last_message_text stays null.
  type ChatWithMessages = {
    chat: LinqChat;
    line: typeof LINQ_LINES[number];
    lastMsg: LinqMessage | null;
    msgs: LinqMessage[];
  };

  const CONCURRENCY = 15;
  const chatWithMsgsResults = await runInBatches(
    allChats,
    CONCURRENCY,
    async ({ chat, line }) => {
      try {
        const msgs = await getMessages(chat.id, 20);
        const lastMsg = msgs.length > 0 ? msgs[0] : null;
        return { chat, line, lastMsg, msgs };
      } catch {
        // Fall back to empty messages — at least we'll have the chat metadata
        return { chat, line, lastMsg: null, msgs: [] };
      }
    }
  );

  const chatsWithMessages: ChatWithMessages[] = [];
  for (const result of chatWithMsgsResults) {
    if (result.status === 'fulfilled') {
      chatsWithMessages.push(result.value);
    } else {
      errors.push(`Message fetch failed: ${String(result.reason)}`);
    }
  }

  // ── Step 6: Build upsert rows ──────────────────────────────────────────
  const BATCH = 50;
  const rows: Record<string, unknown>[] = [];

  for (const { chat, line, lastMsg } of chatsWithMessages) {
    const recipientHandle = chat.handles.find(h => !h.is_me);
    const phone = recipientHandle?.handle || null;
    const contact = phone ? (phoneToContact.get(phone) ?? null) : null;

    const lastMessageAt = lastMsg?.created_at ?? chat.updated_at;
    const lastMessageText = lastMsg
      ? (lastMsg.parts?.find(p => p.type === 'text')?.value ?? null)
      : null;
    const lastMessageDirection = lastMsg
      ? (lastMsg.is_from_me ? 'outbound' : 'inbound')
      : null;
    const hasUnreadReply = lastMsg ? !lastMsg.is_from_me : false;

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
      last_message_at: lastMessageAt,
      last_message_text: lastMessageText,
      last_message_direction: lastMessageDirection,
      has_unread_reply: hasUnreadReply,
      is_urgent: false,
      updated_at: new Date().toISOString(),
    });
  }

  // ── Step 7: Batch upsert ───────────────────────────────────────────────
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

  // ── Step 8: Backfill alumni_contacts.linq_chat_id where null ──────────
  const backfillUpdates: Array<{ contactId: string; chatId: string }> = [];

  for (const { chat } of chatsWithMessages) {
    const recipientHandle = chat.handles.find(h => !h.is_me);
    const phone = recipientHandle?.handle || null;
    const contact = phone ? (phoneToContact.get(phone) ?? null) : null;
    if (contact) {
      backfillUpdates.push({ contactId: contact.id, chatId: chat.id });
    }
  }

  if (backfillUpdates.length > 0) {
    // Fetch existing linq_chat_ids in bulk
    const contactIds = backfillUpdates.map(u => u.contactId);
    const { data: existingContacts } = await supabase
      .from('alumni_contacts')
      .select('id, linq_chat_id')
      .in('id', contactIds);

    const existingMap = new Map<string, string | null>();
    for (const c of existingContacts ?? []) {
      existingMap.set(c.id, c.linq_chat_id);
    }

    // Only update contacts that don't have a linq_chat_id yet
    for (const { contactId, chatId } of backfillUpdates) {
      if (!existingMap.get(contactId)) {
        const { error } = await supabase
          .from('alumni_contacts')
          .update({ linq_chat_id: chatId })
          .eq('id', contactId);
        if (!error) backfilled++;
      }
    }
  }

  return { totalChats, upserted, backfilled, errors, lineBreakdown };
}
