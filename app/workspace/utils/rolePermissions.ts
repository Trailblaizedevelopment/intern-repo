import { EmployeeRole, ROLE_PERMISSIONS, ROLE_LABELS, ROLE_HIERARCHY } from '@/lib/supabase';

export type WorkspaceRole = 'founder' | 'engineer' | 'growth_intern';

/**
 * Maps employee roles to workspace view types
 */
export function getWorkspaceRole(role: EmployeeRole): WorkspaceRole {
  switch (role) {
    case 'founder':
    case 'cofounder':
      return 'founder';
    case 'engineer':
      return 'engineer';
    case 'growth_intern':
    case 'sales_intern':
    case 'marketing_intern':
    default:
      return 'growth_intern';
  }
}

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: EmployeeRole, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes(permission) || perms.includes('all');
}

/**
 * Check if user can access Nucleus admin
 */
export function canAccessNucleus(role: EmployeeRole): boolean {
  return hasPermission(role, 'nucleus');
}

/**
 * Check if user can manage personal leads
 */
export function canManageLeads(role: EmployeeRole): boolean {
  return hasPermission(role, 'personal_leads');
}

/**
 * Check if user can view team members' workspaces (founders only)
 */
export function canViewTeamWorkspaces(role: EmployeeRole): boolean {
  const workspaceRole = getWorkspaceRole(role);
  return workspaceRole === 'founder';
}

/**
 * Get role display label
 */
export function getRoleLabel(role: EmployeeRole): string {
  return ROLE_LABELS[role] || role;
}

/**
 * Get role hierarchy level
 */
export function getRoleLevel(role: EmployeeRole): number {
  return ROLE_HIERARCHY[role] || 0;
}

/**
 * Role-specific feature flags
 */
export interface RoleFeatures {
  showWhiteboard: boolean;
  showLeads: boolean;
  showEngineering: boolean;
  showTeamOverview: boolean;
  showBusinessMetrics: boolean;
  showFocusTimer: boolean;
  showCollaborationFeed: boolean;
  showStrategicPlanning: boolean;
  showTeamSwitcher: boolean;
}

export function getRoleFeatures(role: EmployeeRole): RoleFeatures {
  const workspaceRole = getWorkspaceRole(role);
  
  switch (workspaceRole) {
    case 'founder':
      return {
        showWhiteboard: true,
        showLeads: true,
        showEngineering: false,
        showTeamOverview: true,
        showBusinessMetrics: true,
        showFocusTimer: true,
        showCollaborationFeed: true,
        showStrategicPlanning: true,
        showTeamSwitcher: true,
      };
    case 'engineer':
      return {
        showWhiteboard: true,
        showLeads: false,
        showEngineering: true,
        showTeamOverview: true,
        showBusinessMetrics: false,
        showFocusTimer: true,
        showCollaborationFeed: true,
        showStrategicPlanning: false,
        showTeamSwitcher: false,
      };
    case 'growth_intern':
    default:
      return {
        showWhiteboard: false,
        showLeads: true,
        showEngineering: false,
        showTeamOverview: true,
        showBusinessMetrics: false,
        showFocusTimer: true,
        showCollaborationFeed: true,
        showStrategicPlanning: false,
        showTeamSwitcher: false,
      };
  }
}

/**
 * Navigation items based on role
 */
export interface NavItem {
  name: string;
  href: string;
  icon: string;
  badge?: number;
  emphasized?: boolean;
}

export function getNavigationItems(role: EmployeeRole, unreadCount?: number): NavItem[] {
  const workspaceRole = getWorkspaceRole(role);

  // Shared base for roles that have Inbox
  const baseItems: NavItem[] = [
    { name: 'Dashboard', href: '/workspace', icon: 'LayoutDashboard' },
    { name: 'Inbox', href: '/workspace/inbox', icon: 'Inbox', badge: unreadCount },
  ];

  switch (workspaceRole) {
    case 'founder':
      return [
        ...baseItems,
        { name: 'Customer Success', href: '/nucleus/customer-success', icon: 'HeartHandshake' },
        { name: 'Tickets', href: '/workspace/tickets', icon: 'Ticket', emphasized: true },
        { name: 'My Tasks', href: '/workspace/tasks', icon: 'CheckSquare' },
        { name: 'Projects', href: '/workspace/projects', icon: 'Building2' },
        { name: 'Team', href: '/workspace/team', icon: 'Users' },
        { name: 'Mission Control', href: '/nucleus/mission-control', icon: 'Radar' },
        { name: 'Socials', href: '/workspace/socials', icon: 'Share2' },
      ];
    case 'engineer':
      return [
        ...baseItems,
        { name: 'Tickets', href: '/workspace/tickets', icon: 'Ticket', emphasized: true },
        { name: 'My Tasks', href: '/workspace/tasks', icon: 'CheckSquare' },
        { name: 'Projects', href: '/workspace/projects', icon: 'Building2' },
        { name: 'Team', href: '/workspace/team', icon: 'Users' },
      ];
    case 'growth_intern':
    default: {
      // Interns: Dashboard, War Room, Pipeline, Team
      const internItems: NavItem[] = [
        { name: 'Dashboard', href: '/workspace', icon: 'LayoutDashboard' },
        { name: 'War Room', href: '/nucleus/war-room', icon: 'Tv' },
        { name: 'Pipeline', href: '/nucleus/pipeline', icon: 'TrendingUp' },
        { name: 'Team', href: '/workspace/team', icon: 'Users' },
      ];
      // Marketing interns also get the Socials page
      if (role === 'marketing_intern') {
        internItems.push({ name: 'Socials', href: '/workspace/socials', icon: 'Share2' });
      }
      return internItems;
    }
  }
}
