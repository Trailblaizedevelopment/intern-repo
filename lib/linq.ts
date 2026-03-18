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
  parts: { type: string; value: string }[];
  created_at: string;
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
