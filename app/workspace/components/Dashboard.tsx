'use client';

import React from 'react';
import { useUserRole } from '../hooks/useUserRole';
import { UseWorkspaceDataReturn } from '../hooks/useWorkspaceData';
import { FounderDashboard } from './dashboards/FounderDashboard';
import { EngineerDashboard } from './dashboards/EngineerDashboard';
import { InternDashboard } from './dashboards/InternDashboard';
import { AmbassadorLeaderDashboard } from './dashboards/AmbassadorLeaderDashboard';
import { Employee } from '@/lib/supabase';

interface DashboardProps {
  data: UseWorkspaceDataReturn;
  teamMembers: Employee[];
}

/**
 * Main Dashboard component that renders the appropriate
 * role-based dashboard view
 */
export function Dashboard({ data, teamMembers }: DashboardProps) {
  const { workspaceRole } = useUserRole();

  switch (workspaceRole) {
    case 'founder':
      return <FounderDashboard data={data} teamMembers={teamMembers} />;
    case 'engineer':
      return <EngineerDashboard data={data} teamMembers={teamMembers} />;
    case 'ambassador_leader':
      return <AmbassadorLeaderDashboard />;
    case 'ambassador':
    case 'growth_intern':
    default:
      return <InternDashboard data={data} teamMembers={teamMembers} />;
  }
}
