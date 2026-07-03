import type { SupabaseClient } from '@supabase/supabase-js';
import { getLinearApiKeyHeader } from '@/lib/linear';
import { createLinearCommentWithApiKey } from '@/lib/linear-update-issue';

export interface LinearCommentPayload {
  id: string;
  body: string;
  issue?: { id: string; identifier?: string };
  user?: { id?: string; name?: string; avatarUrl?: string };
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Mirror a Linear comment into CRM ticket_comments (deduped by external_id).
 */
export async function bridgeLinearCommentToTicket(
  supabase: SupabaseClient,
  comment: LinearCommentPayload
): Promise<{ created: boolean; commentId?: string }> {
  const issueId = comment.issue?.id;
  if (!issueId || !comment.id) return { created: false };

  const { data: existingComment } = await supabase
    .from('ticket_comments')
    .select('id')
    .eq('external_id', comment.id)
    .maybeSingle();

  if (existingComment?.id) {
    if (comment.body) {
      await supabase
        .from('ticket_comments')
        .update({ content: comment.body, updated_at: comment.updatedAt ?? new Date().toISOString() })
        .eq('id', existingComment.id);
    }
    return { created: false, commentId: existingComment.id };
  }

  const { data: ticket } = await supabase
    .from('tickets')
    .select('id')
    .eq('external_id', issueId)
    .maybeSingle();

  if (!ticket?.id) return { created: false };

  const { data: inserted, error } = await supabase
    .from('ticket_comments')
    .insert([{
      ticket_id: ticket.id,
      author_id: null,
      author_name: comment.user?.name ?? 'Linear',
      content: comment.body,
      external_id: comment.id,
      source: 'linear',
      created_at: comment.createdAt ?? new Date().toISOString(),
    }])
    .select('id')
    .single();

  if (error || !inserted?.id) {
    console.warn('Failed to bridge Linear comment to ticket:', error?.message);
    return { created: false };
  }

  await supabase.from('ticket_activity').insert([{
    ticket_id: ticket.id,
    actor_id: null,
    action: 'commented',
    to_value: comment.body.substring(0, 100),
    metadata: {
      source: 'linear',
      linear_comment_id: comment.id,
      author_name: comment.user?.name ?? 'Linear',
    },
  }]);

  return { created: true, commentId: inserted.id };
}

/**
 * Remove a bridged CRM comment when Linear deletes a comment.
 */
export async function removeBridgedLinearComment(
  supabase: SupabaseClient,
  linearCommentId: string
): Promise<void> {
  await supabase.from('ticket_comments').delete().eq('external_id', linearCommentId);
}

/**
 * Create a CRM comment and push to Linear when the ticket is linked.
 */
export async function createTicketCommentWithLinearSync(
  supabase: SupabaseClient,
  ticket: { id: string; external_id: string | null; number: number; title: string },
  content: string,
  authorId: string | null,
  mentions: string[] = []
): Promise<{ comment: Record<string, unknown>; linearCommentId: string | null }> {
  let linearCommentId: string | null = null;

  if (ticket.external_id && getLinearApiKeyHeader()) {
    const linearComment = await createLinearCommentWithApiKey(ticket.external_id, content.trim());
    linearCommentId = linearComment.id;
  }

  const { data: comment, error } = await supabase
    .from('ticket_comments')
    .insert([{
      ticket_id: ticket.id,
      author_id: authorId || null,
      content: content.trim(),
      mentions: mentions || [],
      external_id: linearCommentId,
      source: linearCommentId ? 'crm' : 'crm',
    }])
    .select(`
      *,
      author:employees!ticket_comments_author_id_fkey(id, name, email, role)
    `)
    .single();

  if (error || !comment) {
    throw new Error(error?.message ?? 'Failed to create comment');
  }

  if (linearCommentId) {
    await supabase.from('linear_comments').upsert({
      id: linearCommentId,
      issue_id: ticket.external_id,
      body: content.trim(),
      user_name: comment.author?.name ?? null,
      created_at: new Date().toISOString(),
      synced_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  }

  return { comment, linearCommentId };
}

/**
 * Bridge all cached Linear comments into CRM ticket threads (e.g. after full sync).
 */
export async function bridgeAllCachedLinearComments(
  supabase: SupabaseClient
): Promise<{ bridged: number }> {
  const { data: comments, error } = await supabase
    .from('linear_comments')
    .select('id, issue_id, body, user_name, created_at, updated_at')
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  let bridged = 0;
  for (const row of comments ?? []) {
    const result = await bridgeLinearCommentToTicket(supabase, {
      id: row.id,
      body: row.body,
      issue: { id: row.issue_id },
      user: { name: row.user_name ?? undefined },
      createdAt: row.created_at ?? undefined,
      updatedAt: row.updated_at ?? undefined,
    });
    if (result.created) bridged += 1;
  }

  return { bridged };
}
