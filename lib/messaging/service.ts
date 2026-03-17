/**
 * Business logic layer for messaging.
 * Consumes the provider interface — never references Linq directly.
 * All Supabase state updates happen here.
 */

import type { MessagingProvider } from './provider';
import type { SendResult, VerifyResult, Message, LineStatus, MessageService } from './types';
import { classifyResponse, renderTemplate } from './classify';
import { getSupabaseAdmin } from '../supabase-admin';
import { SENDING_LINES } from '../supabase';

interface SendOutreachParams {
  contact_id: string;
  contact_phone: string;
  template: string;
  variables: Record<string, string>;
  line_phone: string;
  touch_number: 1 | 2 | 3;
  existing_conversation_id?: string;
}

interface VerifyChapterParams {
  chapter_id: string;
  line_phone: string;
  batch_size?: number;
}

interface PollResponsesParams {
  chapter_id: string;
}

interface VerifyChapterResult {
  verified: number;
  imessage: number;
  sms: number;
  rcs: number;
  errors: number;
}

interface PollResponsesResult {
  polled: number;
  new_responses: number;
  classifications: Record<string, number>;
  flagged_for_review: { contact_id: string; phone: string; text: string; reason?: string }[];
}

export function createMessagingService(provider: MessagingProvider) {
  return {
    /**
     * Send an outreach message to a contact. Updates Supabase with results.
     */
    async sendOutreach(params: SendOutreachParams): Promise<SendResult> {
      const supabase = getSupabaseAdmin();
      if (!supabase) throw new Error('Database not connected');

      const body = renderTemplate(params.template, params.variables);

      const result = await provider.sendMessage({
        from_line: params.line_phone,
        to_phone: params.contact_phone,
        body,
        existing_conversation_id: params.existing_conversation_id,
      });

      if (result.success) {
        // Update contact with send info
        const touchField = `touch${params.touch_number}_sent_at` as const;
        const statusMap: Record<number, string> = { 1: 'verified', 2: 'pitched', 3: 'pitched' };

        const update: Record<string, unknown> = {
          [touchField]: new Date().toISOString(),
          outreach_status: statusMap[params.touch_number],
        };
        if (result.conversation_id) {
          update.linq_chat_id = result.conversation_id;
        }
        if (params.line_phone) {
          const line = SENDING_LINES.find(l => l.phone === params.line_phone);
          if (line) update.assigned_line = line.number;
        }

        await supabase
          .from('alumni_contacts')
          .update(update)
          .eq('id', params.contact_id);

        // Update daily log
        const lineInfo = SENDING_LINES.find(l => l.phone === params.line_phone);
        const today = new Date().toISOString().split('T')[0];

        await supabase.rpc('increment_daily_log', {
          p_date: today,
          p_line_phone: params.line_phone,
          p_line_label: lineInfo?.label || 'Unknown',
          p_field: 'sends_count',
        }).then(async (res) => {
          // If RPC doesn't exist, fall back to upsert
          if (res.error) {
            const { data: existing } = await supabase
              .from('outreach_daily_log')
              .select('id, sends_count')
              .eq('date', today)
              .eq('line_phone', params.line_phone)
              .single();

            if (existing) {
              await supabase
                .from('outreach_daily_log')
                .update({ sends_count: (existing.sends_count || 0) + 1 })
                .eq('id', existing.id);
            } else {
              await supabase
                .from('outreach_daily_log')
                .insert({
                  date: today,
                  line_phone: params.line_phone,
                  line_label: lineInfo?.label || 'Unknown',
                  sends_count: 1,
                });
            }
          }
        });
      }

      return result;
    },

    /**
     * Verify iMessage eligibility for all unverified contacts in a chapter.
     */
    async verifyChapter(params: VerifyChapterParams): Promise<VerifyChapterResult> {
      const supabase = getSupabaseAdmin();
      if (!supabase) throw new Error('Database not connected');

      // Get unverified contacts
      const { data: contacts } = await supabase
        .from('alumni_contacts')
        .select('id, phone_primary')
        .eq('chapter_id', params.chapter_id)
        .not('phone_primary', 'is', null)
        .is('is_imessage', null)
        .limit(params.batch_size || 500);

      if (!contacts || contacts.length === 0) {
        return { verified: 0, imessage: 0, sms: 0, rcs: 0, errors: 0 };
      }

      const phones = contacts.map((c: { id: string; phone_primary: string | null }) => c.phone_primary!);
      const results = await provider.batchVerifyService({
        from_line: params.line_phone,
        phones,
        batch_size: 10,
        delay_ms: 500,
      });

      let imessage = 0, sms = 0, rcs = 0, errors = 0;

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const contact = contacts[i] as { id: string; phone_primary: string | null };

        if (result.service === 'unknown') {
          errors++;
          continue;
        }

        const isImessage = result.service === 'imessage';
        if (isImessage) imessage++;
        else if (result.service === 'sms') sms++;
        else if (result.service === 'rcs') rcs++;

        const update: Record<string, unknown> = {
          is_imessage: isImessage,
        };
        if (result.conversation_id) {
          // Use linq_chat_id (unified field) — execute route uses this for T3 lookups
          update.linq_chat_id = result.conversation_id;
        }

        await supabase
          .from('alumni_contacts')
          .update(update)
          .eq('id', contact.id);
      }

      return { verified: results.length - errors, imessage, sms, rcs, errors };
    },

    /**
     * Poll Linq for new responses and classify them.
     */
    async pollResponses(params: PollResponsesParams): Promise<PollResponsesResult> {
      const supabase = getSupabaseAdmin();
      if (!supabase) throw new Error('Database not connected');

      const { data: contacts } = await supabase
        .from('alumni_contacts')
        .select('id, phone_primary, provider_conversation_id, last_response_at, outreach_status')
        .eq('chapter_id', params.chapter_id)
        .not('provider_conversation_id', 'is', null)
        .not('outreach_status', 'in', '("signed_up","wrong_number","opted_out")');

      if (!contacts || contacts.length === 0) {
        return { polled: 0, new_responses: 0, classifications: {}, flagged_for_review: [] };
      }

      const classifications: Record<string, number> = {};
      const flagged: PollResponsesResult['flagged_for_review'] = [];
      let newResponses = 0;

      // Process in batches of 10 to not hammer Linq
      for (let i = 0; i < contacts.length; i += 10) {
        const batch = contacts.slice(i, i + 10);

        const batchResults = await Promise.all(
          batch.map(async (contact) => {
            const messages = await provider.getMessages({
              conversation_id: contact.provider_conversation_id!,
              limit: 50,
            });

            // Sort all messages chronologically
            const sorted = [...messages].sort(
              (a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
            );

            // Find newest inbound message
            const inbound = sorted.filter(m => m.direction === 'inbound');

            if (inbound.length === 0) return null;

            const newest = inbound[inbound.length - 1];
            // Skip if we already processed this response
            if (contact.last_response_at) {
              const lastProcessed = new Date(contact.last_response_at).getTime();
              const newestTime = new Date(newest.sent_at).getTime();
              if (newestTime <= lastProcessed) return null;
            }

            // Behavioral flags (independent of keyword classification):
            // 1. Long message (> 150 chars) — likely nuanced, needs human eye
            // 2. Multiple inbound messages (2+) — ongoing back-and-forth
            // 3. Unanswered: last message in thread is inbound with no outbound after it
            const lastMsg = sorted[sorted.length - 1];
            const isLastMsgUnanswered = lastMsg?.direction === 'inbound';
            const hasBehavioralFlag =
              newest.body.length > 150 ||
              inbound.length >= 2 ||
              isLastMsgUnanswered;

            return { contact, message: newest, hasBehavioralFlag, inboundCount: inbound.length };
          })
        );

        for (const result of batchResults) {
          if (!result) continue;
          newResponses++;

          const { classification, needs_human_review, reason } = classifyResponse(result.message.body);
          classifications[classification] = (classifications[classification] || 0) + 1;

          // Flag if keyword match OR behavioral signal
          const behavioralReason = result.hasBehavioralFlag
            ? [
                result.message.body.length > 150 ? 'long message (>150 chars)' : null,
                result.inboundCount >= 2 ? `${result.inboundCount} inbound messages` : null,
                result.inboundCount >= 1 && !needs_human_review && result.hasBehavioralFlag ? 'unanswered inbound' : null,
              ].filter(Boolean).join(', ')
            : null;

          if (needs_human_review || result.hasBehavioralFlag) {
            flagged.push({
              contact_id: result.contact.id,
              phone: result.contact.phone_primary || '',
              text: result.message.body,
              reason: [reason, behavioralReason].filter(Boolean).join(' | ') || 'behavioral flag',
            });
          }

          // Map classification to outreach_status
          const statusMap: Record<string, string> = {
            wrong_number: 'wrong_number',
            declined: 'opted_out',
            signed_up: 'signed_up',
            confirmed: 'responded',
            question: 'responded',
          };

          const newStatus = statusMap[classification] || result.contact.outreach_status;

          await supabase
            .from('alumni_contacts')
            .update({
              last_response_at: result.message.sent_at,
              response_text: result.message.body.slice(0, 500),
              response_classification: classification,
              outreach_status: newStatus,
            })
            .eq('id', result.contact.id);
        }

        // Rate limit between batches
        if (i + 10 < contacts.length) {
          await new Promise(r => setTimeout(r, 500));
        }
      }

      return { polled: contacts.length, new_responses: newResponses, classifications, flagged_for_review: flagged };
    },

    /**
     * Get conversation messages for a contact.
     */
    async getConversation(conversation_id: string): Promise<Message[]> {
      return provider.getMessages({ conversation_id, limit: 50 });
    },

    /**
     * Send a manual reply to an existing conversation.
     */
    async sendReply(params: {
      contact_id: string;
      conversation_id: string;
      line_phone: string;
      body: string;
    }): Promise<SendResult> {
      const result = await provider.sendMessage({
        from_line: params.line_phone,
        to_phone: '', // Not needed for existing convo
        body: params.body,
        existing_conversation_id: params.conversation_id,
      });

      if (result.success) {
        const supabase = getSupabaseAdmin();
        if (supabase) {
          // Log the send
          const lineInfo = SENDING_LINES.find(l => l.phone === params.line_phone);
          const today = new Date().toISOString().split('T')[0];

          const { data: existing } = await supabase
            .from('outreach_daily_log')
            .select('id, sends_count')
            .eq('date', today)
            .eq('line_phone', params.line_phone)
            .single();

          if (existing) {
            await supabase
              .from('outreach_daily_log')
              .update({ sends_count: (existing.sends_count || 0) + 1 })
              .eq('id', existing.id);
          } else {
            await supabase
              .from('outreach_daily_log')
              .insert({
                date: today,
                line_phone: params.line_phone,
                line_label: lineInfo?.label || 'Unknown',
                sends_count: 1,
              });
          }
        }
      }

      return result;
    },

    /**
     * Get status for all sending lines.
     */
    async getAllLineStatus(): Promise<LineStatus[]> {
      const supabase = getSupabaseAdmin();
      const today = new Date().toISOString().split('T')[0];

      const statuses = await Promise.all(
        SENDING_LINES.map(async (line) => {
          const providerStatus = await provider.getLineStatus(line.phone);

          // Get today's send count from our DB
          let sendsToday = 0;
          if (supabase) {
            const { data } = await supabase
              .from('outreach_daily_log')
              .select('sends_count')
              .eq('date', today)
              .eq('line_phone', line.phone)
              .single();
            sendsToday = data?.sends_count || 0;
          }

          return {
            ...providerStatus,
            label: line.label,
            sends_today: sendsToday,
            daily_limit: line.daily_limit,
          };
        })
      );

      return statuses;
    },
  };
}
