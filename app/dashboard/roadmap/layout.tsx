'use client';

import { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth-context';
import ProtectedRoute from '@/components/ProtectedRoute';
import { ToastProvider } from '@/components/Toast';
import { Sidebar } from '@/app/workspace/components/Sidebar';
import { Search, Bell, Settings } from 'lucide-react';
import Link from 'next/link';

function RoadmapLayoutInner({ children }: { children: ReactNode }) {
  return (
    <div className="ws-layout">
      <Sidebar />
      <main className="ws-main">
        <div className="ws-topbar">
          <div className="ws-search">
            <Search size={18} />
            <input type="text" placeholder="Search tasks, projects, messages..." />
            <kbd className="ws-search-shortcut">⌘K</kbd>
          </div>
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
        <div className="ws-content">
          {children}
        </div>
      </main>
    </div>
  );
}

export default function RoadmapLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ProtectedRoute>
        <ToastProvider>
          <RoadmapLayoutInner>{children}</RoadmapLayoutInner>
        </ToastProvider>
      </ProtectedRoute>
    </AuthProvider>
  );
}
