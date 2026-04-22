// Server-side only — do not import from client components

const LINQ_BASE = 'https://api.linqapp.com/api/partner/v3';

function getToken(): string {
  const token = process.env.LINQ_API_TOKEN;
  if (!token) throw new Error('LINQ_API_TOKEN not set');
  return token;
}

export interface LinqHandle {
  handle: string;
  id: string;
  is_me: boolean;
  service: 'iMessage' | 'SMS' | 'RCS';
  status: string;
  joined_at: string;
  left_at: string | null;
}

export interface LinqChat {
  id: string;
  handles: LinqHandle[];
  created_at: string;
  updated_at: string;
  is_archived: boolean;
  is_group: boolean;
  service: string;
}

export interface LinqMessage {
  id: string;
  chat_id: string;
  from: string;
  is_from_me: boolean;
  parts: { type: string; value: string }[];
  created_at: string;
  updated_at?: string;
  delivered_at?: string | null;
  read_at?: string | null;
  sent_at?: string | null;
  is_delivered?: boolean;
  is_read?: boolean;
  // iMessage tapback / reaction fields.
  // One or more of these will be set when the recipient sends a tapback reaction
  // (heart ❤️, thumbs up 👍, ha ha 😂, !! or ? etc.) instead of a text reply.
  // TODO: Verify exact field names by logging a live Linq API response for a reacted message.
  effect?: string | null;                                // e.g. "thumbsup", "heart", "haha", "question", "exclamation"
  reactions?: Array<{ type: string; value: string; sender?: string }> | null;
  message_type?: string | null;                          // may be "reaction" | "tapback" | "effect" for tapbacks
}

/**
 * Returns true if a LinqMessage represents an iMessage tapback/reaction rather than
 * a normal text reply. Checks all known API response shapes because Linq's reaction
 * format is not publicly documented.
 */
export function isLinqReaction(msg: LinqMessage): boolean {
  if (msg.effect) return true;
  if (msg.reactions && msg.reactions.length > 0) return true;
  if (
    msg.message_type === 'reaction' ||
    msg.message_type === 'tapback' ||
    msg.message_type === 'effect'
  ) return true;
  if (msg.parts?.some(p => p.type === 'effect' || p.type === 'reaction' || p.type === 'tapback'))
    return true;
  return false;
}

/**
 * Returns a human-readable reaction label suitable for storage as response_text.
 * e.g. "(iMessage reaction: thumbsup)" or "(iMessage reaction)" if value unknown.
 */
export function getLinqReactionLabel(msg: LinqMessage): string {
  const label =
    msg.effect ??
    msg.reactions?.[0]?.value ??
    msg.parts?.find(p => p.type === 'effect' || p.type === 'reaction' || p.type === 'tapback')?.value;
  return label ? `(iMessage reaction: ${label})` : '(iMessage reaction)';
}

export async function createChat(fromPhone: string, toPhone: string, message?: string): Promise<LinqChat> {
  const body: Record<string, unknown> = { from: fromPhone, to: [toPhone] };
  if (message) {
    body.message = { parts: [{ type: 'text', value: message }] };
  }

  const res = await fetch(`${LINQ_BASE}/chats`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Linq createChat failed (${res.status}): ${text}`);
  }

  return res.json();
}

export async function getMessages(chatId: string, limit = 20): Promise<LinqMessage[]> {
  const res = await fetch(`${LINQ_BASE}/chats/${chatId}/messages?limit=${limit}`, {
    headers: { 'Authorization': `Bearer ${getToken()}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Linq getMessages failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.messages || [];
}

export async function listChats(fromPhone: string, limit = 100, cursor?: string): Promise<{ chats: LinqChat[]; next_cursor?: string }> {
  const params = new URLSearchParams({ from: fromPhone, limit: String(limit) });
  if (cursor) params.set('cursor', cursor);

  const res = await fetch(`${LINQ_BASE}/chats?${params}`, {
    headers: { 'Authorization': `Bearer ${getToken()}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Linq listChats failed (${res.status}): ${text}`);
  }

  return res.json();
}

export function getRecipientService(chat: LinqChat): 'iMessage' | 'SMS' | 'RCS' | null {
  const handles = chat?.handles ?? [];
  const recipient = handles.find(h => !h.is_me);
  return recipient?.service ?? null;
}

export async function getChat(chatId: string): Promise<LinqChat> {
  const res = await fetch(`${LINQ_BASE}/chats/${chatId}`, {
    headers: { 'Authorization': `Bearer ${getToken()}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Linq getChat failed (${res.status}): ${text}`);
  }
  return res.json();
}

export async function sendMessage(chatId: string, message: string, fromPhone?: string): Promise<LinqMessage> {
  const body: Record<string, unknown> = {
    message: { parts: [{ type: 'text', value: message }] },
  };
  if (fromPhone) body.from = fromPhone;

  const res = await fetch(`${LINQ_BASE}/chats/${chatId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Linq sendMessage failed (${res.status}): ${text}`);
  }
  return res.json();
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
