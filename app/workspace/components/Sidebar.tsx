'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import GlobalSearch from '@/components/GlobalSearch';
import { useAuth } from '@/lib/auth-context';
import { useUserRole } from '../hooks/useUserRole';
import { getNavigationItems } from '../utils/rolePermissions';
import {
  LayoutDashboard,
  Inbox,
  CheckSquare,
  PenLine,
  Target,
  Users,
  Zap,
  LogOut,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  MessageSquare,
  LucideIcon,
  TrendingUp,
  Search,
  HeartHandshake,
  Wallet,
  Building2,
  Rocket,
  Ticket,
  GraduationCap,
  Map,
  Star,
  Radar,
  Tv,
  Share2,
  Phone,
} from 'lucide-react';

interface SidebarProps {
  unreadCount?: number;
}

const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard,
  Inbox,
  CheckSquare,
  PenLine,
  Target,
  Users,
  MessageCircle,
  MessageSquare,
  Zap,
  TrendingUp,
  Ticket,
  Building2,
  HeartHandshake,
  GraduationCap,
  Map,
  Star,
  Radar,
  Tv,
  Share2,
  Phone,
};

export function Sidebar({ unreadCount = 0 }: SidebarProps) {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const { role, roleLabel, canAccessNucleus } = useUserRole();
  const [collapsed, setCollapsed] = useState(false);
  const [openTicketCount, setOpenTicketCount] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);

  // Cmd+K / Ctrl+K global shortcut
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setSearchOpen(open => !open);
    }
  }, []);
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const navItems = getNavigationItems(role, unreadCount);

  // Fetch open ticket count for badge
  useEffect(() => {
    let cancelled = false;
    async function fetchTicketCount() {
      try {
        const res = await fetch('/api/tickets?status=active');
        const { data } = await res.json();
        if (!cancelled && Array.isArray(data)) {
          setOpenTicketCount(data.length);
        }
      } catch {
        // Silent fail — badge just shows 0
      }
    }
    fetchTicketCount();
    const interval = setInterval(fetchTicketCount, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const isActive = (href: string) => {
    if (href === '/workspace') return pathname === '/workspace';
    return pathname.startsWith(href);
  };

  const inNucleus = pathname.startsWith('/nucleus');
  const nucleusModules = [
    { name: 'Dashboard', href: '/nucleus', icon: Zap },
    { name: 'War Room', href: '/nucleus/war-room', icon: Tv },
    { name: 'Sales Pipeline', href: '/nucleus/pipeline', icon: TrendingUp },
    { name: 'Customer Success', href: '/nucleus/customer-success', icon: HeartHandshake },
    { name: 'Client Map', href: '/nucleus/client-map', icon: Map },
    { name: 'Finance', href: '/nucleus/finance', icon: Wallet },
    { name: 'Operations', href: '/nucleus/operations', icon: CheckSquare },
    { name: 'Enterprise', href: '/nucleus/enterprise', icon: Building2 },
    { name: 'Fundraising', href: '/nucleus/fundraising', icon: Rocket },
    { name: 'Employees', href: '/nucleus/employees', icon: Users },
    { name: 'Ambassadors', href: '/nucleus/ambassadors', icon: Star },
    { name: 'Mission Control', href: '/nucleus/mission-control', icon: Radar },
  ];

  // Mobile bottom tabs — role-aware
  const isFounderRole = role === 'founder' || role === 'cofounder';
  const isInternRole = role === 'growth_intern' || role === 'sales_intern' || role === 'marketing_intern';

  const bottomTabItems = isFounderRole
    ? [
        { name: 'Dashboard', href: '/workspace', icon: 'LayoutDashboard', badge: 0 },
        { name: 'Customer Success', href: '/nucleus/customer-success', icon: 'HeartHandshake', badge: 0 },
        { name: 'Nucleus', href: '/nucleus', icon: 'Zap', badge: 0 },
        { name: 'Projects', href: '/workspace/projects', icon: 'Building2', badge: 0 },
        { name: 'Tickets', href: '/workspace/tickets', icon: 'Ticket', badge: openTicketCount },
      ]
    : isInternRole
    ? [
        { name: 'Dashboard', href: '/workspace', icon: 'LayoutDashboard', badge: 0 },
        { name: 'War Room', href: '/nucleus/war-room', icon: 'Tv', badge: 0 },
        { name: 'Connects', href: '/workspace/connects', icon: 'Phone', badge: 0 },
        { name: 'Team', href: '/workspace/team', icon: 'Users', badge: 0 },
      ]
    : [
        { name: 'Dashboard', href: '/workspace', icon: 'LayoutDashboard', badge: 0 },
        { name: 'Pipeline', href: '/nucleus/pipeline', icon: 'TrendingUp', badge: 0 },
        { name: 'Projects', href: '/workspace/projects', icon: 'Building2', badge: 0 },
        { name: 'Tickets', href: '/workspace/tickets', icon: 'Ticket', badge: openTicketCount },
      ];

  // Get the page title from the current path
  const getPageTitle = () => {
    if (inNucleus) {
      const nucleusItem = nucleusModules.find(m => 
        m.href === pathname || (m.href !== '/nucleus' && pathname.startsWith(m.href))
      );
      return nucleusItem?.name || 'Nucleus';
    }
    const activeItem = navItems.find(item => isActive(item.href));
    return activeItem?.name || 'Workspace';
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className={`ws-sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="ws-sidebar-header">
          <Link href="/workspace" className="ws-logo">
            <img src="/logos/logo-icon-black.png" alt="Trailblaize" className="ws-logo-icon" />
            {!collapsed && <span className="ws-logo-text">Workspace</span>}
          </Link>
          <button 
            className="ws-collapse-btn"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <nav className="ws-nav">
          {canAccessNucleus && (
            <Link
              href="/nucleus"
              className={`ws-nav-item ${pathname.startsWith('/nucleus') ? 'active' : ''}`}
            >
              <Zap size={20} />
              {!collapsed && <span>Nucleus Admin</span>}
            </Link>
          )}
          {inNucleus && canAccessNucleus && !collapsed && (
            <div className="ws-nav-nucleus-modules">
              {/* Global search trigger */}
              <button
                onClick={() => setSearchOpen(true)}
                className="ws-nav-item ws-nav-sub"
                style={{
                  width: '100%', textAlign: 'left', background: 'none', border: 'none',
                  cursor: 'pointer', color: '#6b7280',
                }}
              >
                <Search size={16} style={{ color: '#9ca3af', flexShrink: 0 }} />
                <span style={{ flex: 1, color: '#9ca3af', fontSize: '0.8125rem' }}>Search…</span>
                <kbd style={{
                  fontSize: '0.6rem', background: '#f3f4f6', border: '1px solid #e5e7eb',
                  borderRadius: 4, padding: '1px 4px', fontFamily: 'monospace', color: '#9ca3af',
                }}>⌘K</kbd>
              </button>
              {nucleusModules.map((m) => (
                <Link
                  key={m.href}
                  href={m.href}
                  className={`ws-nav-item ws-nav-sub ${pathname === m.href || (m.href !== '/nucleus' && pathname.startsWith(m.href)) ? 'active' : ''}`}
                >
                  <m.icon size={18} />
                  <span>{m.name}</span>
                </Link>
              ))}
            </div>
          )}
          {navItems.map((item) => {
            const Icon = iconMap[item.icon] || LayoutDashboard;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`ws-nav-item ${isActive(item.href) ? 'active' : ''} ${item.emphasized ? 'emphasized' : ''}`}
              >
                <Icon size={20} />
                {!collapsed && (
                  <>
                    <span>{item.name}</span>
                    {item.badge && item.badge > 0 && (
                      <span className="ws-nav-badge">{item.badge}</span>
                    )}
                  </>
                )}
                {collapsed && item.badge && item.badge > 0 && (
                  <span className="ws-nav-badge-dot" />
                )}
              </Link>
            );
          })}


        </nav>

        <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

        <div className="ws-sidebar-divider" />

        {/* User Section */}
        <div className="ws-sidebar-footer">
          <div className={`ws-user ${collapsed ? 'collapsed' : ''}`}>
            <div className="ws-user-avatar">
              {profile?.name?.charAt(0) || 'U'}
            </div>
            {!collapsed && (
              <div className="ws-user-info">
                <span className="ws-user-name">{profile?.name}</span>
                <span className="ws-user-role">{roleLabel}</span>
              </div>
            )}
            <button 
              className="ws-logout-btn"
              onClick={signOut}
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Bottom Tab Bar — Mobile only, 4 fixed tabs for all roles */}
      <nav className="ws-bottom-tabs" aria-label="Main navigation">
        {bottomTabItems.map((item) => {
          const Icon = iconMap[item.icon] || LayoutDashboard;
          const active = item.href === '/workspace'
            ? pathname === '/workspace'
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`ws-bottom-tab ${active ? 'active' : ''}`}
            >
              <span className="ws-bottom-tab-icon">
                <Icon size={22} />
                {item.badge > 0 && (
                  <span className="ws-bottom-tab-badge">{item.badge > 99 ? '99+' : item.badge}</span>
                )}
              </span>
              <span className="ws-bottom-tab-label">{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
