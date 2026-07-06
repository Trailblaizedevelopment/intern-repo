import { after, NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  getAllowedSlackUserIds,
  getBrainSlackChannelId,
  getSlackSigningSecret,
  verifySlackSignature,
} from '@/lib/brain/slack/verify';
import { handleSlackChatMessage, stripBotMention } from '@/lib/brain/slack/handle-message';

/**
 * POST /api/brain/slack/events
 *
 * Slack Events API — bidirectional Brain chat via @mention (channel) or DM.
 * Configure in Slack app: Event Subscriptions → Request URL → this endpoint.
 *
 * Subscribed events: app_mention, message.im
 */

export const maxDuration = 120;

interface SlackEventEnvelope {
  type: string;
  challenge?: string;
  event_id?: string;
  event?: SlackEvent;
}

interface SlackEvent {
  type: string;
  user?: string;
  text?: string;
  channel?: string;
  channel_type?: string;
  ts?: string;
  thread_ts?: string;
  bot_id?: string;
  subtype?: string;
}

async function isDuplicateEvent(eventId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  const { data } = await supabase
    .from('brain_action_log')
    .select('id')
    .eq('skill_name', `slack_event:${eventId}`)
    .maybeSingle();

  return Boolean(data);
}

async function markEventProcessed(eventId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  await supabase.from('brain_action_log').insert([
    {
      source: 'manual',
      skill_name: `slack_event:${eventId}`,
      connector_name: 'slack',
      input: { event_id: eventId },
      status: 'success',
    },
  ]);
}

function shouldHandleEvent(event: SlackEvent): { ok: true; text: string } | { ok: false } {
  if (event.bot_id) return { ok: false };
  if (event.subtype && event.subtype !== 'file_share') return { ok: false };
  if (!event.user || !event.channel || !event.ts) return { ok: false };

  const allowed = getAllowedSlackUserIds();
  if (allowed.size > 0 && !allowed.has(event.user)) return { ok: false };

  const brainChannel = getBrainSlackChannelId();

  if (event.type === 'app_mention') {
    if (brainChannel && event.channel !== brainChannel) return { ok: false };
    const text = stripBotMention(event.text || '');
    if (!text) return { ok: false };
    return { ok: true, text };
  }

  if (event.type === 'message' && event.channel_type === 'im') {
    const text = (event.text || '').trim();
    if (!text) return { ok: false };
    return { ok: true, text };
  }

  return { ok: false };
}

async function processSlackEvent(envelope: SlackEventEnvelope): Promise<void> {
  const event = envelope.event;
  const eventId = envelope.event_id;
  if (!event || !eventId) return;

  if (await isDuplicateEvent(eventId)) return;

  const parsed = shouldHandleEvent(event);
  if (!parsed.ok) return;

  await markEventProcessed(eventId);

  const threadTs = event.thread_ts || event.ts;
  if (!threadTs) return;

  await handleSlackChatMessage(parsed.text, {
    channel: event.channel!,
    threadTs,
    userId: event.user!,
  });
}

export async function POST(req: NextRequest) {
  const signingSecret = getSlackSigningSecret();
  if (!signingSecret) {
    return NextResponse.json({ error: 'SLACK_SIGNING_SECRET not configured' }, { status: 500 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-slack-signature');
  const timestamp = req.headers.get('x-slack-request-timestamp');

  if (!verifySlackSignature(signingSecret, signature, timestamp, rawBody)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let envelope: SlackEventEnvelope;
  try {
    envelope = JSON.parse(rawBody) as SlackEventEnvelope;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (envelope.type === 'url_verification') {
    return NextResponse.json({ challenge: envelope.challenge });
  }

  if (envelope.type === 'event_callback' && envelope.event) {
    after(async () => {
      try {
        await processSlackEvent(envelope);
      } catch (err) {
        console.error('[brain/slack/events] handler error:', err);
      }
    });
  }

  return new NextResponse('', { status: 200 });
}
