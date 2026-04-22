/**
 * Provider-agnostic messaging types.
 * The rest of the app ONLY imports from here — never from a provider file.
 */

export type MessageService = 'imessage' | 'sms' | 'rcs' | 'unknown';
export type MessageDirection = 'outbound' | 'inbound';
export type DeliveryStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'unknown';

export interface Message {
  id: string;
  conversation_id: string;
  direction: MessageDirection;
  body: string;
  sent_at: string;
  delivery_status: DeliveryStatus;
  service: MessageService;
  sender_line: string;
  /** True when this message is an iMessage tapback reaction rather than a text reply. */
  is_reaction?: boolean;
  /** Raw reaction/effect value from the provider (e.g. "thumbsup", "heart"). */
  reaction_value?: string;
  raw_provider_data?: unknown;
}

export interface Conversation {
  id: string;
  provider_id: string;
  contact_phone: string;
  service: MessageService;
  our_line: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  message_count: number;
  created_at: string;
}

export interface SendResult {
  success: boolean;
  conversation_id: string | null;
  message_id: string | null;
  service: MessageService;
  error?: string;
}

export interface VerifyResult {
  phone: string;
  service: MessageService;
  conversation_id: string | null;
}

export interface LineStatus {
  phone: string;
  label: string;
  sends_today: number;
  daily_limit: number;
  is_healthy: boolean;
  last_error?: string;
}

export interface SendMessageParams {
  from_line: string;
  to_phone: string;
  body: string;
  existing_conversation_id?: string;
}

export interface VerifyServiceParams {
  from_line: string;
  to_phone: string;
}

export interface BatchVerifyParams {
  from_line: string;
  phones: string[];
  batch_size?: number;
  delay_ms?: number;
}

export interface GetMessagesParams {
  conversation_id: string;
  limit?: number;
  since?: string;
}

export interface ListConversationsParams {
  line_phone: string;
  limit?: number;
  cursor?: string;
}
