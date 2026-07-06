import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { fetchBriefingSnapshot } from './linear-snapshot';
import { composeMorningBriefing } from './compose';
import { postBriefingToSlack } from './slack';
import { MorningBriefingResult, RunMorningBriefingOptions } from './types';

async function logAutomationRun(
  status: 'success' | 'failed',
  message: string,
  error?: string
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const { error: logError } = await supabase.from('brain_action_log').insert([
    {
      source: 'automation',
      skill_name: 'morning_briefing',
      connector_name: 'linear',
      input: { automation: 'morning_briefing' },
      output: { message_preview: message.slice(0, 500) },
      status,
      error: error || null,
    },
  ]);
  if (logError) console.error('[brain/briefing] action log insert failed:', logError.message);

  const { error: autoError } = await supabase
    .from('brain_automations')
    .update({
      last_run_at: new Date().toISOString(),
      last_status: status,
      last_error: error || null,
      updated_at: new Date().toISOString(),
    })
    .eq('name', 'morning_briefing');

  if (autoError) {
    console.warn('[brain/briefing] brain_automations update skipped:', autoError.message);
  }
}

/** End-to-end morning briefing: Linear snapshot → compose → optional Slack. */
export async function runMorningBriefing(
  options: RunMorningBriefingOptions = {}
): Promise<MorningBriefingResult> {
  const dryRun = options.dryRun ?? false;
  const shouldPost = options.postToSlack ?? !dryRun;

  const snapshot = await fetchBriefingSnapshot();
  const message = await composeMorningBriefing(snapshot);

  let slack: MorningBriefingResult['slack'] = {
    attempted: false,
    ok: false,
    targets: [],
  };

  if (shouldPost) {
    const posted = await postBriefingToSlack(message);
    slack = {
      attempted: posted.attempted,
      ok: posted.ok,
      targets: posted.targets,
      error: posted.error,
    };
  }

  const result: MorningBriefingResult = { snapshot, message, slack };

  try {
    await logAutomationRun(
      slack.attempted && !slack.ok ? 'failed' : 'success',
      message,
      slack.error
    );
  } catch (err) {
    console.error('[brain/briefing] audit log failed:', err);
  }

  return result;
}
