'use client';

import { AuthProvider } from '@/lib/auth-context';
import ProtectedRoute from '@/components/ProtectedRoute';
import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { 
  LayoutDashboard, 
  Inbox, 
  CheckSquare, 
  PenLine,
  Users,
  Target,
  Settings,
  Zap,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Bell,
  Search,
  Menu
} from 'lucide-react';

function PortalLayoutInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { profile, signOut, isAdmin } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navigation = [
    { name: 'Dashboard', href: '/portal', icon: LayoutDashboard },
    { name: 'Inbox', href: '/portal/inbox', icon: Inbox, badge: 3 },
    { name: 'My Tasks', href: '/portal/tasks', icon: CheckSquare },
    { name: 'Whiteboard', href: '/workspace/whiteboard', icon: PenLine },
    { name: 'My Leads', href: '/portal/leads', icon: Target },
    { name: 'Team', href: '/portal/team', icon: Users },
  ];

  const isActive = (href: string) => {
    if (href === '/portal') return pathname === '/portal';
    return pathname.startsWith(href);
  };

  return (
    <div className="portal-layout">
      {/* Mobile Header */}
      <header className="portal-mobile-header">
        <button 
          className="portal-mobile-menu-btn"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          <Menu size={20} />
        </button>
        <div className="portal-mobile-logo">
          <img src="/logos/logo-icon-white.png" alt="Trailblaize" />
          <span>Portal</span>
        </div>
        <div className="portal-mobile-actions">
          <button className="portal-icon-btn">
            <Bell size={18} />
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <aside className={`portal-sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="portal-sidebar-header">
          <Link href="/portal" className="portal-logo">
            <img src="/logos/logo-icon-white.png" alt="Trailblaize" className="portal-logo-icon" />
            {!sidebarCollapsed && <span className="portal-logo-text">Portal</span>}
          </Link>
          <button 
            className="portal-collapse-btn"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <nav className="portal-nav">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={`portal-nav-item ${isActive(item.href) ? 'active' : ''}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              <item.icon size={20} />
              {!sidebarCollapsed && (
                <>
                  <span>{item.name}</span>
                  {item.badge && (
                    <span className="portal-nav-badge">{item.badge}</span>
                  )}
                </>
              )}
              {sidebarCollapsed && item.badge && (
                <span className="portal-nav-badge-dot" />
              )}
            </Link>
          ))}
        </nav>

        <div className="portal-sidebar-divider" />

        {/* Quick Access */}
        {!sidebarCollapsed && (
          <div className="portal-quick-access">
            <span className="portal-quick-label">Quick Access</span>
            {isAdmin && (
              <Link href="/nucleus" className="portal-nucleus-link">
                <Zap size={16} />
                <span>Nucleus Admin</span>
              </Link>
            )}
            <Link href="/workspace" className="portal-quick-link">
              <LayoutDashboard size={16} />
              <span>Legacy Workspace</span>
            </Link>
          </div>
        )}

        {/* User Section */}
        <div className="portal-sidebar-footer">
          <div className={`portal-user ${sidebarCollapsed ? 'collapsed' : ''}`}>
            <div className="portal-user-avatar">
              {profile?.name?.charAt(0) || 'U'}
            </div>
            {!sidebarCollapsed && (
              <div className="portal-user-info">
                <span className="portal-user-name">{profile?.name}</span>
                <span className="portal-user-role">{profile?.role}</span>
              </div>
            )}
            <button 
              className="portal-logout-btn"
              onClick={signOut}
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div 
          className="portal-mobile-overlay"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className={`portal-main ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Top Bar */}
        <div className="portal-topbar">
          <div className="portal-search">
            <Search size={18} />
            <input 
              type="text" 
              placeholder="Search tasks, projects, messages..." 
            />
            <kbd className="portal-search-shortcut">⌘K</kbd>
          </div>
          <div className="portal-topbar-actions">
            <button className="portal-icon-btn">
              <Bell size={18} />
              <span className="portal-notification-dot" />
            </button>
            <Link href="/portal/settings" className="portal-icon-btn">
              <Settings size={18} />
            </Link>
          </div>
        </div>

        {/* Page Content */}
        <div className="portal-content">
          {children}
        </div>
      </main>
    </div>
  );
}

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ProtectedRoute>
        <PortalLayoutInner>{children}</PortalLayoutInner>
      </ProtectedRoute>
    </AuthProvider>
  );
}
