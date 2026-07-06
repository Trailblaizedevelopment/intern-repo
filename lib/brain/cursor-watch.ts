import {
  getCursorRun,
  getLatestCursorRunSnapshot,
  isCursorRunActive,
  isCursorRunTerminal,
} from './cursor-api';
import { findOpenPrByBranch } from './github-repo';

export type CursorWatchPhase = 'running' | 'finished' | 'failed' | 'unknown';

export interface CursorWatchResult {
  phase: CursorWatchPhase;
  runId: string | null;
  runStatus: string | null;
  summary: string | null;
  prUrl: string | null;
  branch: string | null;
}

export async function watchCursorAgent(
  agentId: string,
  knownRunId?: string | null
): Promise<CursorWatchResult> {
  const snapshot = knownRunId
    ? await getCursorRun(agentId, knownRunId)
    : await getLatestCursorRunSnapshot(agentId);

  if (!snapshot) {
    return {
      phase: 'unknown',
      runId: null,
      runStatus: null,
      summary: null,
      prUrl: null,
      branch: null,
    };
  }

  const status = snapshot.status.toUpperCase();

  if (isCursorRunActive(status)) {
    return {
      phase: 'running',
      runId: snapshot.runId,
      runStatus: snapshot.status,
      summary: null,
      prUrl: snapshot.prUrl,
      branch: snapshot.branch,
    };
  }

  if (status === 'FINISHED') {
    let prUrl = snapshot.prUrl;
    if (!prUrl && snapshot.branch) {
      const found = await findOpenPrByBranch(snapshot.branch);
      prUrl = found?.url || null;
    }

    return {
      phase: 'finished',
      runId: snapshot.runId,
      runStatus: snapshot.status,
      summary: snapshot.result,
      prUrl,
      branch: snapshot.branch,
    };
  }

  if (isCursorRunTerminal(status)) {
    return {
      phase: 'failed',
      runId: snapshot.runId,
      runStatus: snapshot.status,
      summary: snapshot.result,
      prUrl: snapshot.prUrl,
      branch: snapshot.branch,
    };
  }

  return {
    phase: 'unknown',
    runId: snapshot.runId,
    runStatus: snapshot.status,
    summary: snapshot.result,
    prUrl: snapshot.prUrl,
    branch: snapshot.branch,
  };
}
