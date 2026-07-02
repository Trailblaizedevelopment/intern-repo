// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { 
  verifyLinearWebhookSignature, 
  LINEAR_CONFIG,
  LinearWebhookPayload,
  LinearWebhookAction
} from '@/lib/linear';
import { reconcileLinearIssueById, archiveTicketByExternalId } from '@/lib/linear-reconcile';
import { bridgeLinearCommentToTicket, removeBridgedLinearComment } from '@/lib/linear-comment-bridge';
import { logLinearIssueUpdateActivity } from '@/lib/linear-activity-bridge';

/**
 * POST /api/linear/webhooks
 * Handles incoming webhooks from Linear
 * 
 * Enabled events:
 * - Issue attachments
 * - Issue Labels
 * - Project updates
 * - Issues
 * - Comments
 * - Projects
 */
export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const rawBody = await request.text();
    
    // Get signature from header
    const signature = request.headers.get('linear-signature');
    
    if (!signature) {
      console.error('Linear webhook: Missing signature');
      return NextResponse.json(
        { error: 'Missing webhook signature' },
        { status: 401 }
      );
    }

    // Verify webhook signature
    if (!verifyLinearWebhookSignature(rawBody, signature, LINEAR_CONFIG.webhookSecret)) {
      console.error('Linear webhook: Invalid signature');
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 401 }
      );
    }

    // Parse the webhook payload
    const payload: LinearWebhookPayload = JSON.parse(rawBody);
    
    console.log(`Linear webhook received: ${payload.type} ${payload.action}`, {
      webhookId: payload.webhookId,
      organizationId: payload.organizationId,
    });

    // Create Supabase admin client
    const supabase = getSupabaseAdmin();

    // Store webhook event for audit/debugging
    await supabase.from('linear_webhook_events').insert({
      webhook_id: payload.webhookId,
      event_type: payload.type,
      action: payload.action,
      data: payload.data,
      organization_id: payload.organizationId,
      processed: false,
    });

    // Process the webhook based on type and action
    let processError: string | null = null;

    try {
      switch (payload.type) {
        case 'Issue':
          await handleIssueEvent(supabase, payload.action, payload.data);
          break;
        case 'Comment':
          await handleCommentEvent(supabase, payload.action, payload.data);
          break;
        case 'Project':
          await handleProjectEvent(supabase, payload.action, payload.data);
          break;
        case 'ProjectUpdate':
          await handleProjectUpdateEvent(supabase, payload.action, payload.data);
          break;
        case 'IssueLabel':
          await handleIssueLabelEvent(supabase, payload.action, payload.data);
          break;
        case 'Attachment':
          await handleAttachmentEvent(supabase, payload.action, payload.data);
          break;
        default:
          console.log(`Unhandled webhook type: ${payload.type}`);
      }
    } catch (err) {
      processError = err instanceof Error ? err.message : 'Unknown processing error';
      console.error(`Error processing ${payload.type} ${payload.action}:`, err);
    }

    // Update webhook event with processing result
    await supabase
      .from('linear_webhook_events')
      .update({ 
        processed: processError === null,
        error_message: processError,
      })
      .eq('webhook_id', payload.webhookId)
      .eq('event_type', payload.type)
      .eq('action', payload.action);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Linear webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

// Handle Issue events
async function handleIssueEvent(
  supabase: SupabaseClient,
  action: LinearWebhookAction,
  data: Record<string, unknown>
) {
  const issueData = data as {
    id: string;
    identifier: string;
    title: string;
    description?: string;
    priority: number;
    priorityLabel: string;
    state: { id: string; name: string; color: string; type: string };
    assignee?: { id: string; name: string; email: string };
    creator?: { id: string; name: string };
    team: { id: string; name: string; key: string };
    project?: { id: string; name: string };
    labels?: Array<{ id: string; name: string; color: string }>;
    estimate?: number;
    dueDate?: string;
    url: string;
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
    canceledAt?: string;
  };

  if (action === 'remove') {
    await supabase.from('linear_issue_labels').delete().eq('issue_id', issueData.id);
    await supabase.from('linear_issues').delete().eq('id', issueData.id);
    try {
      await archiveTicketByExternalId(supabase, issueData.id);
    } catch (err) {
      console.warn(`Failed to archive CRM ticket for removed Linear issue ${issueData.id}:`, err);
    }
    return;
  }

  const { data: ticketBefore } = await supabase
    .from('tickets')
    .select('id, title, description, priority, status, assignee_id')
    .eq('external_id', issueData.id)
    .maybeSingle();

  if (action === 'update' && ticketBefore) {
    try {
      await logLinearIssueUpdateActivity(supabase, ticketBefore, issueData);
    } catch (err) {
      console.warn(`Failed to log Linear activity for ${issueData.id}:`, err);
    }
  }

  // Ensure team exists
  if (issueData.team) {
    await supabase.from('linear_teams').upsert({
      id: issueData.team.id,
      name: issueData.team.name,
      key: issueData.team.key,
      synced_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  }

  // Ensure project exists if present
  if (issueData.project) {
    await supabase.from('linear_projects').upsert({
      id: issueData.project.id,
      name: issueData.project.name,
      synced_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  }

  // Upsert the issue
  await supabase.from('linear_issues').upsert({
    id: issueData.id,
    identifier: issueData.identifier,
    title: issueData.title,
    description: issueData.description || null,
    priority: issueData.priority,
    priority_label: issueData.priorityLabel,
    state_id: issueData.state?.id,
    state_name: issueData.state?.name,
    state_color: issueData.state?.color,
    state_type: issueData.state?.type,
    assignee_id: issueData.assignee?.id,
    assignee_name: issueData.assignee?.name,
    assignee_email: issueData.assignee?.email,
    creator_id: issueData.creator?.id,
    creator_name: issueData.creator?.name,
    team_id: issueData.team?.id,
    project_id: issueData.project?.id,
    estimate: issueData.estimate,
    due_date: issueData.dueDate,
    url: issueData.url,
    created_at: issueData.createdAt,
    updated_at: issueData.updatedAt,
    completed_at: issueData.completedAt,
    canceled_at: issueData.canceledAt,
    synced_at: new Date().toISOString(),
  }, { onConflict: 'id' });

  // Handle labels if present
  if (issueData.labels && issueData.labels.length > 0) {
    // Upsert labels
    for (const label of issueData.labels) {
      await supabase.from('linear_labels').upsert({
        id: label.id,
        name: label.name,
        color: label.color,
        team_id: issueData.team?.id,
        synced_at: new Date().toISOString(),
      }, { onConflict: 'id' });
    }

    // Clear existing issue-label relationships
    await supabase
      .from('linear_issue_labels')
      .delete()
      .eq('issue_id', issueData.id);

    // Insert new relationships
    await supabase.from('linear_issue_labels').insert(
      issueData.labels.map(label => ({
        issue_id: issueData.id,
        label_id: label.id,
      }))
    );
  }

  const reconcile = await reconcileLinearIssueById(supabase, issueData.id);
  if (!reconcile.ok) {
    console.warn(`Linear webhook reconcile failed for ${issueData.id}:`, reconcile.error);
  }
}

// Handle Comment events
async function handleCommentEvent(
  supabase: SupabaseClient,
  action: LinearWebhookAction,
  data: Record<string, unknown>
) {
  const commentData = data as {
    id: string;
    body: string;
    issue: { id: string; identifier: string };
    user: { id: string; name: string; avatarUrl?: string };
    createdAt: string;
    updatedAt: string;
  };

  if (action === 'remove') {
    await supabase
      .from('linear_comments')
      .delete()
      .eq('id', commentData.id);
    try {
      await removeBridgedLinearComment(supabase, commentData.id);
    } catch (err) {
      console.warn(`Failed to remove bridged comment ${commentData.id}:`, err);
    }
    return;
  }

  await supabase.from('linear_comments').upsert({
    id: commentData.id,
    issue_id: commentData.issue?.id,
    body: commentData.body,
    user_id: commentData.user?.id,
    user_name: commentData.user?.name,
    user_avatar_url: commentData.user?.avatarUrl,
    created_at: commentData.createdAt,
    updated_at: commentData.updatedAt,
    synced_at: new Date().toISOString(),
  }, { onConflict: 'id' });

  try {
    await bridgeLinearCommentToTicket(supabase, commentData);
  } catch (err) {
    console.warn(`Failed to bridge Linear comment ${commentData.id}:`, err);
  }
}

// Handle Project events
async function handleProjectEvent(
  supabase: SupabaseClient,
  action: LinearWebhookAction,
  data: Record<string, unknown>
) {
  const projectData = data as {
    id: string;
    name: string;
    description?: string;
    icon?: string;
    color?: string;
    state: string;
    startDate?: string;
    targetDate?: string;
    progress: number;
  };

  if (action === 'remove') {
    await supabase
      .from('linear_projects')
      .delete()
      .eq('id', projectData.id);
    return;
  }

  await supabase.from('linear_projects').upsert({
    id: projectData.id,
    name: projectData.name,
    description: projectData.description,
    icon: projectData.icon,
    color: projectData.color,
    state: projectData.state,
    start_date: projectData.startDate,
    target_date: projectData.targetDate,
    progress: projectData.progress,
    synced_at: new Date().toISOString(),
  }, { onConflict: 'id' });
}

// Handle Project Update events (progress updates, milestones)
async function handleProjectUpdateEvent(
  supabase: SupabaseClient,
  action: LinearWebhookAction,
  data: Record<string, unknown>
) {
  // Project updates are status/progress updates on a project
  // We can store these or just update the project's progress
  const updateData = data as {
    id: string;
    project: { id: string };
    body: string;
    health: string;
    createdAt: string;
  };

  // For now, just log project updates
  console.log('Project update:', {
    projectId: updateData.project?.id,
    health: updateData.health,
    body: updateData.body?.substring(0, 100),
  });

  // Could store in a separate table if needed for audit trail
}

// Handle Issue Label events
async function handleIssueLabelEvent(
  supabase: SupabaseClient,
  action: LinearWebhookAction,
  data: Record<string, unknown>
) {
  const labelData = data as {
    id: string;
    name: string;
    color: string;
    description?: string;
    team?: { id: string };
  };

  if (action === 'remove') {
    await supabase
      .from('linear_labels')
      .delete()
      .eq('id', labelData.id);
    return;
  }

  await supabase.from('linear_labels').upsert({
    id: labelData.id,
    name: labelData.name,
    color: labelData.color,
    description: labelData.description,
    team_id: labelData.team?.id,
    synced_at: new Date().toISOString(),
  }, { onConflict: 'id' });
}

// Handle Attachment events
async function handleAttachmentEvent(
  supabase: SupabaseClient,
  action: LinearWebhookAction,
  data: Record<string, unknown>
) {
  const attachmentData = data as {
    id: string;
    title: string;
    url: string;
    subtitle?: string;
    metadata?: Record<string, unknown>;
    issue: { id: string };
    createdAt: string;
  };

  if (action === 'remove') {
    await supabase
      .from('linear_attachments')
      .delete()
      .eq('id', attachmentData.id);
    return;
  }

  await supabase.from('linear_attachments').upsert({
    id: attachmentData.id,
    issue_id: attachmentData.issue?.id,
    title: attachmentData.title,
    url: attachmentData.url,
    subtitle: attachmentData.subtitle,
    metadata: attachmentData.metadata,
    created_at: attachmentData.createdAt,
    synced_at: new Date().toISOString(),
  }, { onConflict: 'id' });
}

// OPTIONS handler for CORS preflight (if needed)
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, linear-signature',
    },
  });
}
