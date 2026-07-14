import { after, NextRequest, NextResponse } from 'next/server';
import {
  getAllowedSlackUserIds,
  getSlackSigningSecret,
  verifySlackSignature,
} from '@/lib/brain/slack/verify';
import { HOME_QUICK_PROMPTS, runHomeQuickPrompt } from '@/lib/brain/slack/home';

/**
 * POST /api/brain/slack/interactions
 *
 * Slack Interactivity endpoint (Block Kit button clicks from App Home).
 * Configure: Slack app → Interactivity & Shortcuts → Request URL → this endpoint.
 */

export const maxDuration = 120;

interface SlackAction {
  action_id?: string;
  type?: string;
}

interface SlackInteractionPayload {
  type?: string;
  user?: { id?: string };
  actions?: SlackAction[];
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

  const params = new URLSearchParams(rawBody);
  const payloadRaw = params.get('payload');
  if (!payloadRaw) {
    return NextResponse.json({ error: 'Missing payload' }, { status: 400 });
  }

  let payload: SlackInteractionPayload;
  try {
    payload = JSON.parse(payloadRaw) as SlackInteractionPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid payload JSON' }, { status: 400 });
  }

  if (payload.type === 'block_actions') {
    const userId = payload.user?.id;
    const actionId = payload.actions?.[0]?.action_id;

    if (userId && actionId && actionId in HOME_QUICK_PROMPTS) {
      const allowed = getAllowedSlackUserIds();
      if (allowed.size === 0 || allowed.has(userId)) {
        after(async () => {
          try {
            const result = await runHomeQuickPrompt(userId, actionId);
            if (!result.ok) {
              console.error('[brain/slack/interactions] quick prompt failed:', result.error);
            }
          } catch (err) {
            console.error('[brain/slack/interactions] handler error:', err);
          }
        });
      }
    }
    // Link buttons (e.g. Open Messages) may still send block_actions — ignore unknown ids.
  }

  return new NextResponse('', { status: 200 });
}
