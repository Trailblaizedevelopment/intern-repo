'use client';

import { ReactNode, useCallback, useEffect, useState } from 'react';
import { AuthProvider } from '@/lib/auth-context';
import ProtectedRoute from '@/components/ProtectedRoute';
import { ToastProvider } from '@/components/Toast';
import GlobalSearch from '@/components/GlobalSearch';
import { Sidebar } from './components/Sidebar';
import { Search, Bell, Settings } from 'lucide-react';
import Link from 'next/link';

function WorkspaceLayoutInner({ children }: { children: ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchShortcut, setSearchShortcut] = useState('⌘K');

  useEffect(() => {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    setSearchShortcut(isMac ? '⌘K' : 'Ctrl+K');
  }, []);

  const toggleSearch = useCallback(() => {
    setSearchOpen((open) => !open);
  }, []);

  useEffect(() => {
    const onToggleSearch = () => toggleSearch();
    window.addEventListener('workspace:toggle-search', onToggleSearch);
    return () => window.removeEventListener('workspace:toggle-search', onToggleSearch);
  }, [toggleSearch]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggleSearch();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSearch]);

  return (
    <div className="ws-layout">
      <Sidebar unreadCount={3} />
      
      <main className="ws-main">
        {/* Top Bar */}
        <div className="ws-topbar">
          <div className="ws-topbar-spacer" aria-hidden="true" />
          <button
            type="button"
            className="ws-search"
            onClick={() => setSearchOpen(true)}
            aria-label="Open search"
          >
            <Search size={16} aria-hidden="true" />
            <span className="ws-search-placeholder">Search tasks, projects, messages…</span>
            <kbd className="ws-search-shortcut">{searchShortcut}</kbd>
          </button>
          <div className="ws-topbar-actions">
            <button className="ws-icon-btn" aria-label="Notifications">
              <Bell size={18} />
              <span className="ws-notification-dot" />
            </button>
            <Link href="/workspace/settings" className="ws-icon-btn" aria-label="Settings">
              <Settings size={18} />
            </Link>
          </div>
        </div>

        <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

        {/* Page Content */}
        <div className="ws-content">
          {children}
        </div>
      </main>
    </div>
  );
}

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ProtectedRoute>
        <ToastProvider>
          <WorkspaceLayoutInner>{children}</WorkspaceLayoutInner>
        </ToastProvider>
      </ProtectedRoute>
    </AuthProvider>
  );
}
