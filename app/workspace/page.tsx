'use client';

import React from 'react';
import { useAuth } from '@/lib/auth-context';
import { useUserRole } from './hooks/useUserRole';
import { useWorkspaceData } from './hooks/useWorkspaceData';
import { CommandCenter } from './components/CommandCenter';
import { InternDashboard } from './components/dashboards/InternDashboard';

/**
 * Main Workspace Page
 * - growth_intern → focused InternDashboard (deals + pipeline)
 * - everyone else → CommandCenter (unchanged)
 */
export default function WorkspacePage() {
  const { profile } = useAuth();
  const { loading: roleLoading, isIntern } = useUserRole();
  const workspaceData = useWorkspaceData();

  const firstName = profile?.name?.split(' ')[0] || 'there';

  if (workspaceData.loading || roleLoading) {
    return (
      <div className="ws-loading">
        <div className="ws-loading-spinner" />
        <p>Loading your workspace...</p>
      </div>
    );
  }

  if (workspaceData.error) {
    return (
      <div className="ws-error">
        <h2>Something went wrong</h2>
        <p>{workspaceData.error}</p>
        <button onClick={() => window.location.reload()}>Try again</button>
      </div>
    );
  }

  // Growth interns get their own focused dashboard
  if (isIntern) {
    return (
      <div className="ws-page">
        <InternDashboard
          data={workspaceData}
          teamMembers={workspaceData.teamMembers}
        />
      </div>
    );
  }

  // Founders and engineers get the existing CommandCenter dashboard (unchanged)
  return (
    <div className="ws-page">
      <CommandCenter
        data={workspaceData}
        teamMembers={workspaceData.teamMembers}
        firstName={firstName}
      />
    </div>
  );
}
