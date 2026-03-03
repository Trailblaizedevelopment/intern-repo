/**
 * The contract any messaging provider must implement.
 * To swap providers, write a new class implementing this interface
 * and change the import in lib/messaging/index.ts.
 */

import type {
  SendResult,
  VerifyResult,
  Conversation,
  Message,
  LineStatus,
  SendMessageParams,
  VerifyServiceParams,
  BatchVerifyParams,
  GetMessagesParams,
  ListConversationsParams,
} from './types';

export interface MessagingProvider {
  readonly name: string;

  /** Send a message to a phone number. Creates or reuses a conversation. */
  sendMessage(params: SendMessageParams): Promise<SendResult>;

  /** Check what service (iMessage/SMS/RCS) a phone number resolves to. */
  verifyService(params: VerifyServiceParams): Promise<VerifyResult>;

  /** Batch verify multiple phone numbers with rate limiting. */
  batchVerifyService(params: BatchVerifyParams): Promise<VerifyResult[]>;

  /** Get messages for an existing conversation. */
  getMessages(params: GetMessagesParams): Promise<Message[]>;

  /** List all conversations for a sending line. */
  listConversations(params: ListConversationsParams): Promise<{
    conversations: Conversation[];
    next_cursor?: string;
  }>;

  /** Get current status/health for a sending line. */
  getLineStatus(line_phone: string): Promise<LineStatus>;
}
