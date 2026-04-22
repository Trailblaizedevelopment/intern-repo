/**
 * Linq V3 messaging provider.
 * This is the ONLY file that knows about Linq's API.
 * All other code uses the provider-agnostic types from ../types.ts
 */

import type { MessagingProvider } from '../provider';
import type {
  SendResult,
  VerifyResult,
  Conversation,
  Message,
  LineStatus,
  MessageService,
  SendMessageParams,
  VerifyServiceParams,
  BatchVerifyParams,
  GetMessagesParams,
  ListConversationsParams,
} from '../types';

const LINQ_BASE = 'https://api.linqapp.com/api/partner/v3';
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 500;

function getToken(): string {
  const token = process.env.LINQ_API_TOKEN;
  if (!token) throw new Error('LINQ_API_TOKEN not set');
  return token;
}

function headers(): Record<string, string> {
  return {
    'Authorization': `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Map Linq service string to our provider-agnostic enum */
function mapService(linqService: string | null | undefined): MessageService {
  if (!linqService) return 'unknown';
  const s = linqService.toLowerCase();
  if (s === 'imessage') return 'imessage';
  if (s === 'sms') return 'sms';
  if (s === 'rcs') return 'rcs';
  return 'unknown';
}

// ---- Linq-specific response types (internal only) ----

interface LinqHandle {
  handle: string;
  id: string;
  is_me: boolean;
  service: string;
  status: string;
  joined_at: string;
  left_at: string | null;
}

interface LinqChat {
  id: string;
  handles: LinqHandle[];
  created_at: string;
  updated_at: string;
  is_archived: boolean;
  is_group: boolean;
  service: string;
}

interface LinqMessagePart {
  type: string;
  value: string;
}

interface LinqMessage {
  id: string;
  chat_id: string;
  from: string;
  parts: LinqMessagePart[];
  created_at: string;
  // iMessage tapback / reaction fields (see lib/linq.ts for details)
  effect?: string | null;
  reactions?: Array<{ type: string; value: string; sender?: string }> | null;
  message_type?: string | null;
}

// ---- Provider implementation ----

export class LinqProvider implements MessagingProvider {
  readonly name = 'linq';

  async sendMessage(params: SendMessageParams): Promise<SendResult> {
    try {
      // If we have an existing conversation, send to it directly
      if (params.existing_conversation_id) {
        const res = await fetch(
          `${LINQ_BASE}/chats/${params.existing_conversation_id}/messages`,
          {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ text: params.body }),
          }
        );
        if (!res.ok) {
          const text = await res.text();
          return {
            success: false,
            conversation_id: params.existing_conversation_id,
            message_id: null,
            service: 'unknown',
            error: `Linq reply failed (${res.status}): ${text}`,
          };
        }
        const data = await res.json();
        return {
          success: true,
          conversation_id: params.existing_conversation_id,
          message_id: data.id || null,
          service: 'imessage', // existing convo assumed iMessage
        };
      }

      // Create new conversation + send
      const body: Record<string, unknown> = {
        from: params.from_line,
        to: [params.to_phone],
        message: { parts: [{ type: 'text', value: params.body }] },
      };

      const res = await fetch(`${LINQ_BASE}/chats`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        return {
          success: false,
          conversation_id: null,
          message_id: null,
          service: 'unknown',
          error: `Linq createChat failed (${res.status}): ${text}`,
        };
      }

      const chat: LinqChat = await res.json();
      const recipientHandle = chat.handles.find(h => !h.is_me);
      const service = mapService(recipientHandle?.service);

      return {
        success: true,
        conversation_id: chat.id,
        message_id: null, // Linq doesn't return message id on create
        service,
      };
    } catch (err) {
      return {
        success: false,
        conversation_id: null,
        message_id: null,
        service: 'unknown',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async verifyService(params: VerifyServiceParams): Promise<VerifyResult> {
    try {
      // Create chat without message to detect service
      const res = await fetch(`${LINQ_BASE}/chats`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ from: params.from_line, to: [params.to_phone] }),
      });

      if (!res.ok) {
        const text = await res.text();
        return { phone: params.to_phone, service: 'unknown', conversation_id: null };
      }

      const chat: LinqChat = await res.json();
      const recipientHandle = chat.handles.find(h => !h.is_me);

      return {
        phone: params.to_phone,
        service: mapService(recipientHandle?.service),
        conversation_id: chat.id,
      };
    } catch {
      return { phone: params.to_phone, service: 'unknown', conversation_id: null };
    }
  }

  async batchVerifyService(params: BatchVerifyParams): Promise<VerifyResult[]> {
    const batchSize = params.batch_size || BATCH_SIZE;
    const delayMs = params.delay_ms || BATCH_DELAY_MS;
    const results: VerifyResult[] = [];

    for (let i = 0; i < params.phones.length; i += batchSize) {
      const batch = params.phones.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(phone => this.verifyService({ from_line: params.from_line, to_phone: phone }))
      );
      results.push(...batchResults);

      // Rate limit between batches
      if (i + batchSize < params.phones.length) {
        await sleep(delayMs);
      }
    }

    return results;
  }

  async getMessages(params: GetMessagesParams): Promise<Message[]> {
    try {
      const urlParams = new URLSearchParams({ limit: String(params.limit || 50) });
      const res = await fetch(
        `${LINQ_BASE}/chats/${params.conversation_id}/messages?${urlParams}`,
        { headers: headers() }
      );

      if (!res.ok) return [];

      const data = await res.json();
      const messages: LinqMessage[] = data.messages || [];

      return messages.map(m => {
        const isReaction = this.isReaction(m);
        const reactionValue = isReaction ? this.reactionValue(m) : undefined;
        const body = isReaction
          ? (reactionValue ? `(iMessage reaction: ${reactionValue})` : '(iMessage reaction)')
          : m.parts.filter(p => p.type === 'text').map(p => p.value).join('');

        return {
          id: m.id,
          conversation_id: m.chat_id,
          direction: this.isOurLine(m.from) ? 'outbound' as const : 'inbound' as const,
          body,
          sent_at: m.created_at,
          delivery_status: 'sent' as const,
          service: 'imessage' as const,
          sender_line: m.from,
          is_reaction: isReaction || undefined,
          reaction_value: reactionValue,
          raw_provider_data: m,
        };
      });
    } catch {
      return [];
    }
  }

  async listConversations(params: ListConversationsParams): Promise<{
    conversations: Conversation[];
    next_cursor?: string;
  }> {
    try {
      const urlParams = new URLSearchParams({
        from: params.line_phone,
        limit: String(params.limit || 100),
      });
      if (params.cursor) urlParams.set('cursor', params.cursor);

      const res = await fetch(`${LINQ_BASE}/chats?${urlParams}`, {
        headers: headers(),
      });

      if (!res.ok) return { conversations: [] };

      const data = await res.json();
      const chats: LinqChat[] = data.chats || [];

      const conversations: Conversation[] = chats.map(chat => {
        const recipient = chat.handles.find(h => !h.is_me);
        return {
          id: chat.id,
          provider_id: chat.id,
          contact_phone: recipient?.handle || '',
          service: mapService(recipient?.service),
          our_line: params.line_phone,
          last_message_at: chat.updated_at,
          last_message_preview: null,
          message_count: 0,
          created_at: chat.created_at,
        };
      });

      return { conversations, next_cursor: data.next_cursor };
    } catch {
      return { conversations: [] };
    }
  }

  async getLineStatus(line_phone: string): Promise<LineStatus> {
    // Linq doesn't have a health endpoint — we derive status from ability to list chats
    try {
      const res = await fetch(
        `${LINQ_BASE}/chats?from=${encodeURIComponent(line_phone)}&limit=1`,
        { headers: headers() }
      );
      return {
        phone: line_phone,
        label: '',
        sends_today: 0, // Tracked in our DB, not by Linq
        daily_limit: 50,
        is_healthy: res.ok,
        last_error: res.ok ? undefined : `HTTP ${res.status}`,
      };
    } catch (err) {
      return {
        phone: line_phone,
        label: '',
        sends_today: 0,
        daily_limit: 50,
        is_healthy: false,
        last_error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Check if a phone number is one of our sending lines */
  private isOurLine(phone: string): boolean {
    const OUR_LINES = ['+16462101111', '+16462178274', '+16462442696'];
    return OUR_LINES.includes(phone);
  }

  /** Detect if a LinqMessage is an iMessage tapback reaction */
  private isReaction(m: LinqMessage): boolean {
    if (m.effect) return true;
    if (m.reactions && m.reactions.length > 0) return true;
    if (m.message_type === 'reaction' || m.message_type === 'tapback' || m.message_type === 'effect') return true;
    if (m.parts?.some(p => p.type === 'effect' || p.type === 'reaction' || p.type === 'tapback')) return true;
    return false;
  }

  /** Extract the raw reaction/effect value from a LinqMessage, if present */
  private reactionValue(m: LinqMessage): string | undefined {
    return (
      m.effect ??
      m.reactions?.[0]?.value ??
      m.parts?.find(p => p.type === 'effect' || p.type === 'reaction' || p.type === 'tapback')?.value ??
      undefined
    );
  }
}
