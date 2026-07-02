import type { ToastType } from '@/components/Toast';

export interface LinearSyncStats {
  issues?: number;
  tickets?: number;
  ticketsCreated?: number;
  ticketsUpdated?: number;
  prunedIssues?: number;
  archivedTickets?: number;
}

export interface LinearSyncResponse {
  mode?: 'incremental' | 'full';
  synced?: LinearSyncStats;
  reconcileErrors?: string[];
}

export function formatLinearSyncToast(
  response: LinearSyncResponse,
  fullSync: boolean
): { message: string; type: ToastType } {
  const synced = response.synced ?? {};
  const issues = synced.issues ?? 0;
  const created = synced.ticketsCreated ?? 0;
  const updated = synced.ticketsUpdated ?? 0;
  const archived = synced.archivedTickets ?? 0;
  const reconcileErrors = response.reconcileErrors?.length ?? 0;

  if (reconcileErrors > 0) {
    return {
      message: `Linear sync finished with ${reconcileErrors} reconcile warning${reconcileErrors === 1 ? '' : 's'}.`,
      type: 'info',
    };
  }

  const parts: string[] = [];

  if (issues > 0) {
    parts.push(`Pulled ${issues} issue${issues === 1 ? '' : 's'} from Linear`);
  }

  if (created > 0 && updated > 0) {
    parts.push(`${created} new ticket${created === 1 ? '' : 's'}, ${updated} updated`);
  } else if (created > 0) {
    parts.push(`${created} new workspace ticket${created === 1 ? '' : 's'}`);
  } else if (updated > 0) {
    parts.push(`${updated} workspace ticket${updated === 1 ? '' : 's'} updated`);
  } else if (issues > 0) {
    parts.push('workspace tickets already matched');
  }

  if (archived > 0) {
    parts.push(
      `removed ${archived} ticket${archived === 1 ? '' : 's'} deleted in Linear from the board`
    );
  }

  if (parts.length === 0) {
    return {
      message: fullSync
        ? 'Full sync complete — workspace tickets match Linear'
        : 'Already up to date — no new Linear changes',
      type: 'info',
    };
  }

  const hasRemovals = archived > 0;
  const prefix = fullSync ? 'Full sync:' : 'Linear sync:';

  return {
    message: `${prefix} ${parts.join(' · ')}`,
    type: hasRemovals ? 'info' : 'success',
  };
}

export function linearSyncHadChanges(response: LinearSyncResponse): boolean {
  const synced = response.synced ?? {};
  return (
    (synced.issues ?? 0) > 0 ||
    (synced.ticketsCreated ?? 0) > 0 ||
    (synced.ticketsUpdated ?? 0) > 0 ||
    (synced.archivedTickets ?? 0) > 0
  );
}
