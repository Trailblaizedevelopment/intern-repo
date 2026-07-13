'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  Palette,
  MoreHorizontal,
  Send,
  Sparkles,
  Brain,
} from 'lucide-react';

const SIDEBAR_EXPANDED_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = 72;
const SIDEBAR_SNAP_MIDPOINT = (SIDEBAR_EXPANDED_WIDTH + SIDEBAR_COLLAPSED_WIDTH) / 2;
const SIDEBAR_LABEL_COLLAPSE_WIDTH = 120;
const SIDEBAR_WIDTH_STORAGE_KEY = 'ws-sidebar-width';

function useSidebarResize() {
  const [width, setWidth] = useState(SIDEBAR_EXPANDED_WIDTH);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (!stored) return;
    const parsed = Number(stored);
    if (Number.isNaN(parsed)) return;
    setWidth(parsed <= SIDEBAR_SNAP_MIDPOINT ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH);
  }, []);

  useEffect(() => {
    const layout = document.querySelector('.ws-layout') as HTMLElement | null;
    if (!layout) return;

    layout.style.setProperty('--ws-sidebar-width', `${width}px`);
    layout.classList.toggle('ws-sidebar-resizing', isResizing);
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(width));
  }, [width, isResizing]);

  const onResizeStart = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (window.matchMedia('(max-width: 1023px)').matches) return;

      event.preventDefault();
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);

      const startX = event.clientX;
      const startWidth = width;
      setIsResizing(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onPointerMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== event.pointerId) return;
        const delta = moveEvent.clientX - startX;
        const next = Math.min(
          SIDEBAR_EXPANDED_WIDTH,
          Math.max(SIDEBAR_COLLAPSED_WIDTH, startWidth + delta),
        );
        setWidth(next);
      };

      const onPointerUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== event.pointerId) return;

        handle.releasePointerCapture(event.pointerId);
        handle.removeEventListener('pointermove', onPointerMove);
        handle.removeEventListener('pointerup', onPointerUp);
        handle.removeEventListener('pointercancel', onPointerUp);

        setWidth((current) =>
          current < SIDEBAR_SNAP_MIDPOINT ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH,
        );
        setIsResizing(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      handle.addEventListener('pointermove', onPointerMove);
      handle.addEventListener('pointerup', onPointerUp);
      handle.addEventListener('pointercancel', onPointerUp);
    },
    [width],
  );

  const collapsed = width < SIDEBAR_LABEL_COLLAPSE_WIDTH;

  return { width, collapsed, isResizing, onResizeStart };
}

interface SidebarProps {
  unreadCount?: number;
}

type FounderNavGroup = {
  label: string;
  items: { name: string; href: string; Icon: LucideIcon }[];
};

function FounderNavSection({
  group,
  collapsed,
  isActive,
}: {
  group: FounderNavGroup;
  collapsed: boolean;
  isActive: (href: string) => boolean;
}) {
  const pathname = usePathname();
  const hasActiveItem = group.items.some((item) => isActive(item.href));
  const [isOpen, setIsOpen] = useState(hasActiveItem);

  // Auto-expand when navigating into this section, but allow manual collapse afterward
  useEffect(() => {
    if (hasActiveItem) setIsOpen(true);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  if (collapsed) {
    return (
      <>
        {group.items.map((item) => (
          <Link
            key={`${item.href}-${item.name}`}
            href={item.href}
            title={item.name}
            aria-label={item.name}
            className={`ws-nav-item ws-nav-sub ${isActive(item.href) ? 'active' : ''}`}
          >
            <item.Icon size={18} />
          </Link>
        ))}
      </>
    );
  }

  return (
    <div className="ws-nav-section">
      <button
        type="button"
        className="ws-nav-section-toggle"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="ws-nav-section-label">{group.label}</span>
        <ChevronRight size={14} className="ws-nav-section-chevron" aria-hidden="true" />
      </button>
      <div className={`ws-nav-section-drawer${isOpen ? ' is-open' : ''}`}>
        <div className="ws-nav-section-drawer-inner">
          {group.items.map((item) => (
            <Link
              key={`${item.href}-${item.name}`}
              href={item.href}
              className={`ws-nav-item ws-nav-sub ${isActive(item.href) ? 'active' : ''}`}
            >
              <item.Icon size={18} />
              <span>{item.name}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
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
  Palette,
  Wallet,
  Rocket,
  MoreHorizontal,
  Send,
  Sparkles,
};

export function Sidebar({ unreadCount = 0 }: SidebarProps) {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const { role, roleLabel, canAccessNucleus } = useUserRole();
  const { collapsed, isResizing, onResizeStart } = useSidebarResize();
  const [openTicketCount, setOpenTicketCount] = useState(0);
  const [showMoreSheet, setShowMoreSheet] = useState(false);

  const openSearch = useCallback(() => {
    window.dispatchEvent(new CustomEvent('workspace:toggle-search'));
  }, []);

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
    { name: 'Sales Room', href: '/nucleus/war-room', icon: Tv },
    { name: 'Customer Success', href: '/nucleus/customer-success', icon: HeartHandshake },
    { name: 'Creative Studio', href: '/nucleus/creative-studio', icon: Sparkles },
    { name: 'Client Map', href: '/nucleus/client-map', icon: Map },
    { name: 'Finance', href: '/nucleus/finance', icon: Wallet },
    { name: 'Operations', href: '/nucleus/operations', icon: CheckSquare },
    { name: 'Enterprise', href: '/nucleus/enterprise', icon: Building2 },
    { name: 'Fundraising', href: '/nucleus/fundraising', icon: Rocket },
    { name: 'Employees', href: '/nucleus/employees', icon: Users },
    { name: 'Ambassadors', href: '/nucleus/ambassadors', icon: Star },
    { name: 'Mission Control', href: '/nucleus/mission-control', icon: Radar },
  ];

  // Role flags
  const isFounderRole = role === 'founder' || role === 'cofounder';
  const isInternRole = role === 'growth_intern' || role === 'sales_intern' || role === 'marketing_intern';
  const isAmbassadorLeaderRole = role === 'ambassador_leader';
  const isMarketingDirectorRole = role === 'marketing_director';
  const isAmbassadorRole = role === 'ambassador';

  // Founder: grouped desktop nav sections
  const founderNavGroups = [
    {
      label: 'Command Center',
      items: [
        { name: 'Sales Room', href: '/nucleus/war-room', Icon: Tv },
        { name: 'Customer Success', href: '/nucleus/customer-success', Icon: HeartHandshake },
        { name: 'Creative Studio',   href: '/nucleus/creative-studio',    Icon: Sparkles },
        { name: 'Client Map',        href: '/nucleus/client-map',         Icon: Map },
      ],
    },
    {
      label: 'Operations',
      items: [
        { name: 'Finance',     href: '/nucleus/finance',      Icon: Wallet },
        { name: 'Operations',  href: '/nucleus/operations',   Icon: CheckSquare },
        { name: 'Enterprise',  href: '/nucleus/enterprise',   Icon: Building2 },
        { name: 'Fundraising', href: '/nucleus/fundraising',  Icon: Rocket },
      ],
    },
    {
      label: 'Team',
      items: [
        { name: 'Employees',       href: '/nucleus/employees',       Icon: Users },
        { name: 'Ambassadors',     href: '/nucleus/ambassadors',     Icon: Star },
        { name: 'Mission Control', href: '/nucleus/mission-control', Icon: Radar },
      ],
    },
    {
      label: 'Growth',
      items: [
        { name: 'Outreach',        href: '/workspace/outreach', Icon: Send },
        { name: 'Connects',        href: '/workspace/connects', Icon: Phone },
        { name: 'Creative Studio', href: '/workspace/socials',  Icon: Palette },
        { name: 'Projects',        href: '/workspace/projects', Icon: Building2 },
        { name: 'Tickets',         href: '/workspace/tickets',  Icon: Ticket },
        { name: 'Team',            href: '/workspace/team',     Icon: Users },
      ],
    },
  ];

  // More sheet items (founders mobile — everything not in the 3 main tabs)
  const moreSheetItems = [
    { name: 'Sales Room',      href: '/nucleus/war-room',            Icon: TrendingUp },
    { name: 'Creative Studio',  href: '/nucleus/creative-studio',    Icon: Sparkles },
    { name: 'Client Map',       href: '/nucleus/client-map',         Icon: Map },
    { name: 'Finance',          href: '/nucleus/finance',            Icon: Wallet },
    { name: 'Operations',       href: '/nucleus/operations',         Icon: CheckSquare },
    { name: 'Enterprise',       href: '/nucleus/enterprise',         Icon: Building2 },
    { name: 'Fundraising',      href: '/nucleus/fundraising',        Icon: Rocket },
    { name: 'Employees',        href: '/nucleus/employees',          Icon: Users },
    { name: 'Ambassadors',      href: '/nucleus/ambassadors',        Icon: Star },
    { name: 'Mission Control',  href: '/nucleus/mission-control',    Icon: Radar },
    { name: 'Creative Studio',  href: '/workspace/socials',          Icon: Palette },
    { name: 'Outreach',         href: '/workspace/outreach',         Icon: Send },
    { name: 'Connects',         href: '/workspace/connects',         Icon: Phone },
    { name: 'Projects',         href: '/workspace/projects',         Icon: Building2 },
    { name: 'Tickets',          href: '/workspace/tickets',          Icon: Ticket },
    { name: 'Team',             href: '/workspace/team',             Icon: Users },
  ];

  // Mobile bottom tabs — MAX 4, role-specific
  type BottomTabItem = { name: string; href?: string; icon: string; badge?: number; isMore?: boolean };
  const bottomTabItems: BottomTabItem[] = isFounderRole
    ? [
        { name: 'Home',    href: '/workspace',                icon: 'LayoutDashboard', badge: 0 },
        { name: 'Command', href: '/nucleus/war-room',         icon: 'Tv',              badge: 0 },
        { name: 'Success', href: '/nucleus/customer-success', icon: 'HeartHandshake',  badge: 0 },
        { name: 'More',                                       icon: 'Zap',             isMore: true },
      ]
    : isInternRole
    ? [
        { name: 'Home',     href: '/workspace',          icon: 'LayoutDashboard', badge: 0 },
        { name: 'Sales Room', href: '/nucleus/war-room',  icon: 'Tv',              badge: 0 },
        { name: 'Connects', href: '/workspace/connects', icon: 'Phone',           badge: 0 },
      ]
    : isAmbassadorLeaderRole
    ? [
        { name: 'Home',        href: '/workspace',           icon: 'LayoutDashboard', badge: 0 },
        { name: 'Ambassadors', href: '/nucleus/ambassadors', icon: 'Star',            badge: 0 },
      ]
    : isMarketingDirectorRole
    ? [
        { name: 'Home',           href: '/workspace',        icon: 'LayoutDashboard', badge: 0 },
        { name: 'Creative Studio',href: '/workspace/socials', icon: 'Palette',         badge: 0 },
      ]
    : isAmbassadorRole
    ? [
        { name: 'Portal', href: '/ambassador', icon: 'Star', badge: 0 },
      ]
    : [
        { name: 'Dashboard', href: '/workspace',          icon: 'LayoutDashboard', badge: 0 },
        { name: 'Sales Room',  href: '/nucleus/war-room',   icon: 'TrendingUp',      badge: 0 },
        { name: 'Projects',  href: '/workspace/projects', icon: 'Building2',       badge: 0 },
        { name: 'Tickets',   href: '/workspace/tickets',  icon: 'Ticket',          badge: openTicketCount },
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
      <aside className={`ws-sidebar${collapsed ? ' collapsed' : ''}${isResizing ? ' is-resizing' : ''}`}>
        <div className="ws-sidebar-header">
          <Link href="/workspace" className="ws-logo">
            <img src="/logos/logo-icon-black.png" alt="Trailblaize" className="ws-logo-icon" />
            {!collapsed && <span className="ws-logo-text">Workspace</span>}
          </Link>
        </div>

        <nav className="ws-nav">
          {isFounderRole ? (
            <>
              {/* Founder desktop: Home + grouped sections */}
              <Link
                href="/workspace"
                title={collapsed ? 'Home' : undefined}
                aria-label={collapsed ? 'Home' : undefined}
                className={`ws-nav-item ${pathname === '/workspace' ? 'active' : ''}`}
              >
                <LayoutDashboard size={20} />
                {!collapsed && <span>Home</span>}
              </Link>
              {founderNavGroups.map((group, groupIndex) => (
                <React.Fragment key={group.label}>
                  {collapsed && groupIndex > 0 && (
                    <div className="ws-nav-collapsed-divider" aria-hidden="true" />
                  )}
                  <FounderNavSection
                    group={group}
                    collapsed={collapsed}
                    isActive={isActive}
                  />
                </React.Fragment>
              ))}
            </>
          ) : (
            <>
              {canAccessNucleus && (
                <Link
                  href="/nucleus"
                  title={collapsed ? 'Nucleus Admin' : undefined}
                  aria-label={collapsed ? 'Nucleus Admin' : undefined}
                  className={`ws-nav-item ${pathname.startsWith('/nucleus') ? 'active' : ''}`}
                >
                  <Zap size={20} />
                  {!collapsed && <span>Nucleus Admin</span>}
                </Link>
              )}
              {inNucleus && canAccessNucleus && (
                <div className={`ws-nav-nucleus-modules${collapsed ? ' collapsed' : ''}`}>
                  {!collapsed && (
                    <button
                      onClick={openSearch}
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
                  )}
                  {nucleusModules.map((m) => (
                    <Link
                      key={m.href}
                      href={m.href}
                      title={collapsed ? m.name : undefined}
                      aria-label={collapsed ? m.name : undefined}
                      className={`ws-nav-item ws-nav-sub ${pathname === m.href || (m.href !== '/nucleus' && pathname.startsWith(m.href)) ? 'active' : ''}`}
                    >
                      <m.icon size={collapsed ? 18 : 18} />
                      {!collapsed && <span>{m.name}</span>}
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
                    title={collapsed ? item.name : undefined}
                    aria-label={collapsed ? item.name : undefined}
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
              {/* Dev Console — founding engineer only (server enforces access) */}
              {profile?.email?.toLowerCase() === 'devin@trailblaize.net' && (
                <Link
                  href="/workspace/dev-console"
                  title={collapsed ? 'Dev Console' : undefined}
                  aria-label={collapsed ? 'Dev Console' : undefined}
                  className={`ws-nav-item ${isActive('/workspace/dev-console') ? 'active' : ''}`}
                >
                  <Brain size={20} />
                  {!collapsed && <span>Dev Console</span>}
                </Link>
              )}
            </>
          )}
        </nav>

        <div className="ws-sidebar-divider" />

        {/* User Section */}
        <div className="ws-sidebar-footer">
          <div className={`ws-user ${collapsed ? 'collapsed' : ''}`}>
            <div
              className="ws-user-avatar"
              title={collapsed ? profile?.name ?? 'User' : undefined}
            >
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
              aria-label="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>

        <div
          className="ws-sidebar-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label="Drag to resize sidebar"
          onPointerDown={onResizeStart}
        />
      </aside>

      {/* Bottom Tab Bar — Mobile only, role-specific (max 4 tabs) */}
      <nav className="ws-bottom-tabs" aria-label="Main navigation">
        {bottomTabItems.map((item) => {
          const Icon = iconMap[item.icon] || LayoutDashboard;

          if (item.isMore) {
            return (
              <button
                key="more"
                onClick={() => setShowMoreSheet(prev => !prev)}
                className={`ws-bottom-tab ${showMoreSheet ? 'active' : ''}`}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
              >
                <span className="ws-bottom-tab-icon"><Icon size={22} /></span>
                <span className="ws-bottom-tab-label">{item.name}</span>
              </button>
            );
          }

          const active = item.href === '/workspace'
            ? pathname === '/workspace'
            : pathname.startsWith(item.href!);
          return (
            <Link
              key={item.name}
              href={item.href!}
              className={`ws-bottom-tab ${active ? 'active' : ''}`}
            >
              <span className="ws-bottom-tab-icon">
                <Icon size={22} />
                {(item.badge ?? 0) > 0 && (
                  <span className="ws-bottom-tab-badge">{(item.badge ?? 0) > 99 ? '99+' : item.badge}</span>
                )}
              </span>
              <span className="ws-bottom-tab-label">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* More Sheet — slide-up overlay (Founders only, mobile) */}
      {showMoreSheet && (
        <>
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 49,
              background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
            }}
            onClick={() => setShowMoreSheet(false)}
          />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
            background: '#ffffff',
            borderRadius: '20px 20px 0 0',
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)',
            maxHeight: '75vh',
            overflowY: 'auto',
            boxShadow: '0 -8px 32px rgba(0,0,0,0.12)',
          }}>
            {/* Drag handle */}
            <div style={{
              width: '36px', height: '4px', background: '#E5E7EB',
              borderRadius: '9999px', margin: '12px auto 16px',
            }} />
            {moreSheetItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setShowMoreSheet(false)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0 20px', minHeight: '48px',
                  textDecoration: 'none', color: '#111827',
                  borderBottom: '1px solid #F9FAFB',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <item.Icon size={20} color="#6B7280" />
                  <span style={{ fontSize: '0.9375rem', fontWeight: 500 }}>{item.name}</span>
                </div>
                <ChevronRight size={16} color="#D1D5DB" />
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
