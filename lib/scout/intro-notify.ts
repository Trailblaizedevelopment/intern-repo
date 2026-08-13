import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendMessage, createChat } from '@/lib/linq';
import { resolveScoutSendContext } from '@/lib/scout/followup';

export interface NotifyMemberResult {
  sent: boolean;
  reason?: string;
  message?: string;
}

function targetNameFromIntro(intro: {
  platform_target_snapshot?: { name?: string } | null;
  target?: { name?: string } | null;
}): string {
  const snap = intro.platform_target_snapshot;
  if (snap && typeof snap === 'object' && typeof snap.name === 'string' && snap.name) {
    return snap.name;
  }
  if (intro.target?.name) return intro.target.name;
  return 'someone in your chapter';
}

/**
 * After Nucleus approves an intro (status → sent): ping the requester via Linq.
 * Does NOT text alumni — member yes later is handled by agent / human flag.
 */
export async function notifyMemberOfApprovedIntro(
  introId: string,
  approvedBy?: string | null
): Promise<NotifyMemberResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { sent: false, reason: 'db_not_configured' };

  const { data: intro, error } = await supabase
    .from('scout_introductions')
    .select(
      `
      id,
      requester_id,
      reason,
      platform_target_snapshot,
      target:target_id(name),
      requester:requester_id(id, name, phone_number)
    `
    )
    .eq('id', introId)
    .single();

  if (error || !intro) {
    return { sent: false, reason: 'intro_not_found' };
  }

  const requesterId = intro.requester_id as string;
  const targetName = targetNameFromIntro(
    intro as {
      platform_target_snapshot?: { name?: string } | null;
      target?: { name?: string } | null;
    }
  );
  const requesterName =
    (intro.requester as { name?: string } | null)?.name?.split(' ')[0] || 'hey';

  const message = `${requesterName} — found someone who might be a fit: ${targetName}. Want me to make the intro?`;

  const ctx = await resolveScoutSendContext(requesterId);
  if (!ctx) {
    return { sent: false, reason: 'no_send_context' };
  }

  try {
    let linqChatId = ctx.linq_chat_id;
    if (linqChatId) {
      await sendMessage(linqChatId, message, ctx.linq_line);
    } else {
      const chat = await createChat(ctx.linq_line, ctx.phone_number, message);
      linqChatId = chat.id;
    }

    await supabase.from('scout_conversations').insert({
      profile_id: requesterId,
      phone_number: ctx.phone_number,
      linq_line: ctx.linq_line,
      linq_chat_id: linqChatId,
      direction: 'outbound',
      message_body: message,
      read: true,
    });

    // Leave a note for human alumni outreach after member confirms
    const note = [
      approvedBy ? `Approved by ${approvedBy}.` : 'Approved in Nucleus.',
      `Member pinged about ${targetName}.`,
      'Do not auto-text alumni — await member yes, then Owen reaches out.',
    ].join(' ');

    await supabase
      .from('scout_introductions')
      .update({
        reason: intro.reason ? `${intro.reason}\n\n[${note}]` : note,
        updated_at: new Date().toISOString(),
      })
      .eq('id', introId);

    // Put agent in await_requester_yes so yes/no is handled cleanly
    await supabase
      .from('scout_profiles')
      .update({
        agent_state: 'await_requester_yes',
        active_intro_id: introId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', requesterId);

    return { sent: true, message };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'send_failed';
    console.error('[scout/intro-notify] send failed:', msg);
    return { sent: false, reason: msg };
  }
}
