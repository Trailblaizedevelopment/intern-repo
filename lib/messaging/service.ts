/**
 * Business logic layer for messaging.
 * Uses whichever provider is configured — never references Linq directly.
 * All Supabase writes happen here so API routes stay thin.
 */

import type { MessagingProvider } from './provider';
import type { SendResult, VerifyResult, Message, LineStatus } from './types';
import { classifyResponse, renderTemplate } from './classify';
import { getSupabaseAdmin } from '../supabase-admin';
import { SENDING_LINES } from '../supabase';

export function createMessagingService(provider: MessagingProvider) {
  return {
    get providerName() { return provider.name; },

    /**
     * Send an outreach message to a contact.
     * Handles template rendering, provider send, and Supabase state updates.
     */
    async sendOutreach(params: {
      contact_id: string;
      template: string;
      variables: Record<string, string>;
      line_phone: string;
      to_phone: string;
      touch_number: 1 | 2 | 3;
      existing_conversation_id?: string;
    }): Promise<SendResult> {
      const supabase = getSupabaseAdmin();
      if (!supabase) throw new Error('Database not connected');

      const body = renderTemplate(params.template, params.variables);

      const result = await provider.sendMessage({
        from_line: params.line_phone,
        to_phone: params.to_phone,
        body,
        existing_conversation_id: params.existing_conversation_id,
      });

      // Update contact in Supabase
      const touchField = `touch${params.touch_number}_sent_at` as const;
      const statusMap: Record<number, string> = { 1: 'verified', 2: 'pitched', 3: 'pitched' };

      if (result.success) {
        const update: Record<string, unknown> = {
          [touchField]: new Date().toISOString(),
          outreach_status: statusMap[params.touch_number],
        };
        if (result.conversation_id) {
          update.provider_conversation_id = result.conversation_id;
        }

        await supabase
          .from('alumni_contacts')
          .update(update)
          .eq('id', params.contact_id);

        // Log to daily log
        const line = SENDING_LINES.find(l => l.phone === params.line_phone);
        if (line) {
          await this.incrementDailyLog(line.phone, line.label, 'sends_count');
        }
      } else {
        // Log error
        const line = SENDING_LINES.find(l => l.phone === params.line_phone);
        if (line) {
          await this.incrementDailyLog(line.phone, line.label, 'errors_count');
        }
      }

      return result;
    },

    /**
     * Verify iMessage eligibility for all unverified contacts in a chapter.
     */
    async verifyChapter(params: {
      chapter_id: string;
      line_phone: string;
      batch_size?: number;
    }): Promise<{ verified: number; imessage: number; sms: number; errors: number }> {
      const supabase = getSupabaseAdmin();
      if (!supabase) throw new Error('Database not connected');

      // Get unverified contacts
      const { data: contacts } = await supabase
        .from('alumni_contacts')
        .select('id, phone_primary')
        .eq('chapter_id', params.chapter_id)
        .not('phone_primary', 'is', null)
        .is('is_imessage', null)
        .limit(params.batch_size || 50);

      if (!contacts || contacts.length === 0) {
        return { verified: 0, imessage: 0, sms: 0, errors: 0 };
      }

      const phones = contacts.map(c => c.phone_primary!);
      const results = await provider.batchVerifyService({
        from_line: params.line_phone,
        phones,
        batch_size: 10,
        delay_ms: 500,
      });

      let imessage = 0, sms = 0, errors = 0;

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const contact = contacts[i];

        if (result.service === 'unknown') {
          errors++;
          continue;
        }

        const isImessage = result.service === 'imessage';
        if (isImessage) imessage++;
        else sms++;

        const update: Record<string, unknown> = { is_imessage: isImessage };
        if (result.conversation_id) {
          update.provider_conversation_id = result.conversation_id;
        }

        await supabase
          .from('alumni_contacts')
          .update(update)
          .eq('id', contact.id);
      }

      return { verified: imessage + sms, imessage, sms, errors };
    },

    /**
     * Poll provider for new responses and classify them.
     */
    async pollResponses(params: {
      chapter_id: string;
    }): Promise<{ polled: number; new_responses: number; classifications: Record<string, number> }> {
      const supabase = getSupabaseAdmin();
      if (!supabase) throw new Error('Database not connected');

      const { data: contacts } = await supabase
        .from('alumni_contacts')
        .select('id, provider_conversation_id, last_response_at, outreach_status')
        .eq('chapter_id', params.chapter_id)
        .not('provider_conversation_id', 'is', null)
        .not('outreach_status', 'in', '("signed_up","wrong_number","opted_out")');

      if (!contacts || contacts.length === 0) {
        return { polled: 0, new_responses: 0, classifications: {} };
      }

      let newResponses = 0;
      const classifications: Record<string, number> = {};

      // Process in batches of 10
      for (let i = 0; i < contacts.length; i += 10) {
        const batch = contacts.slice(i, i + 10);
        
        await Promise.all(batch.map(async (contact) => {
          const messages = await provider.getMessages({
            conversation_id: contact.provider_conversation_id!,
            limit: 10,
          });

          // Find newest inbound message
          const inbound = messages
            .filter(m => m.direction === 'inbound')
            .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());

          if (inbound.length === 0) return;

          const latest = inbound[0];

          // Skip if we already processed this response
          if (contact.last_response_at) {
            const lastKnown = new Date(contact.last_response_at).getTime();
            if (new Date(latest.sent_at).getTime() <= lastKnown) return;
          }

          newResponses++;
          const { classification } = classifyResponse(latest.body);
          classifications[classification] = (classifications[classification] || 0) + 1;

          // Map classification to outreach_status
          const statusMap: Record<string, string> = {
            wrong_number: 'wrong_number',
            declined: 'opted_out',
            signed_up: 'signed_up',
            confirmed: 'responded',
            question: 'responded',
          };

          const update: Record<string, unknown> = {
            last_response_at: latest.sent_at,
            response_text: latest.body.slice(0, 500),
            response_classification: classification,
          };

          if (statusMap[classification]) {
            update.outreach_status = statusMap[classification];
          }

          await supabase
            .from('alumni_contacts')
            .update(update)
            .eq('id', contact.id);
        }));

        // Rate limit between batches
        if (i + 10 < contacts.length) {
          await new Promise(r => setTimeout(r, 500));
        }
      }

      // Update daily log
      if (newResponses > 0) {
        for (const line of SENDING_LINES) {
          await this.incrementDailyLog(line.phone, line.label, 'responses_count', 0);
        }
      }

      return { polled: contacts.length, new_responses: newResponses, classifications };
    },

    /**
     * Get conversation messages for a contact.
     */
    async getConversation(conversation_id: string): Promise<Message[]> {
      return provider.getMessages({ conversation_id, limit: 50 });
    },

    /**
     * Send a reply to an existing conversation.
     */
    async sendReply(params: {
      contact_id: string;
      conversation_id: string;
      body: string;
      line_phone: string;
    }): Promise<SendResult> {
      const result = await provider.sendMessage({
        from_line: params.line_phone,
        to_phone: '', // not needed for existing convo
        body: params.body,
        existing_conversation_id: params.conversation_id,
      });

      return result;
    },

    /**
     * Get status for all sending lines.
     */
    async getAllLineStatus(): Promise<LineStatus[]> {
      const supabase = getSupabaseAdmin();
      if (!supabase) throw new Error('Database not connected');

      const today = new Date().toISOString().split('T')[0];

      const statuses = await Promise.all(
        SENDING_LINES.map(async (line) => {
          const [providerStatus, { data: dailyLog }] = await Promise.all([
            provider.getLineStatus(line.phone),
            supabase
              .from('outreach_daily_log')
              .select('sends_count')
              .eq('date', today)
              .eq('line_phone', line.phone)
              .single(),
          ]);

          return {
            ...providerStatus,
            label: line.label,
            sends_today: dailyLog?.sends_count || 0,
            daily_limit: line.daily_limit,
          };
        })
      );

      return statuses;
    },

    /**
     * Increment a counter in the daily log (upsert).
     */
    async incrementDailyLog(
      linePhone: string,
      lineLabel: string,
      field: 'sends_count' | 'responses_count' | 'signups_count' | 'errors_count',
      increment: number = 1
    ): Promise<void> {
      const supabase = getSupabaseAdmin();
      if (!supabase) return;

      const today = new Date().toISOString().split('T')[0];

      // Upsert: try to increment, create if not exists
      const { data: existing } = await supabase
        .from('outreach_daily_log')
        .select('id, ' + field)
        .eq('date', today)
        .eq('line_phone', linePhone)
        .single();

      if (existing) {
        await supabase
          .from('outreach_daily_log')
          .update({ [field]: (existing[field] || 0) + increment })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('outreach_daily_log')
          .insert({
            date: today,
            line_phone: linePhone,
            line_label: lineLabel,
            [field]: increment,
          });
      }
    },
  };
}
