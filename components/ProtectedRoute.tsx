'use client';

import React, { ReactNode, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import NucleusLogin from './NucleusLogin';
import { ROLE_LABELS } from '@/lib/supabase';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
}

export default function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { user, profile, loading, isAdmin, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Handle role-based routing after login
  useEffect(() => {
    if (loading || !user || !profile) return;
    
    const isNucleusRoute = pathname.startsWith('/nucleus');
    
    // Growth interns are allowed through to specific nucleus routes
    const isGrowthIntern = profile.role === 'growth_intern';
    const internAllowedRoutes = [
      '/nucleus/war-room',
    ];
    const isInternAllowedNucleusRoute = isGrowthIntern && internAllowedRoutes.some(r => pathname.startsWith(r));
    
    // Non-admins trying to access /nucleus get redirected to /workspace
    // Exception: growth_intern can access pipeline + war room
    if (isNucleusRoute && !isAdmin && !isInternAllowedNucleusRoute) {
      console.log('Redirecting non-admin to workspace. Role:', profile.role);
      router.replace('/workspace');
    }
  }, [loading, user, profile, isAdmin, pathname, router]);

  // Show loading state
  if (loading) {
    return (
      <div className="nucleus-loading-screen">
        <div className="nucleus-loading-content">
          <img src="/logos/logo-icon-white.png" alt="Trailblaize" className="nucleus-loading-logo" />
          <div className="nucleus-loading-spinner" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated - show login
  if (!user) {
    return <NucleusLogin />;
  }

  // Profile should always exist now (built from JWT metadata)
  // But just in case, handle the edge case
  if (!profile) {
    return (
      <div className="nucleus-loading-screen">
        <div className="nucleus-loading-content">
          <img src="/logos/logo-icon-white.png" alt="Trailblaize" className="nucleus-loading-logo" />
          <div className="nucleus-loading-spinner" />
          <p>Setting up your workspace...</p>
        </div>
      </div>
    );
  }

  // Non-admin on nucleus routes - show brief redirect message
  // Exception: growth_intern can access pipeline + war room
  const isNucleusRoute = pathname.startsWith('/nucleus');
  const isGrowthIntern = profile.role === 'growth_intern';
  const internNucleusAllowed = ['/nucleus/war-room'];
  const isInternAllowedNucleusRoute = isGrowthIntern && internNucleusAllowed.some(r => pathname.startsWith(r));
  if (isNucleusRoute && !isAdmin && !isInternAllowedNucleusRoute) {
    return (
      <div className="nucleus-loading-screen">
        <div className="nucleus-loading-content">
          <img src="/logos/logo-icon-white.png" alt="Trailblaize" className="nucleus-loading-logo" />
          <div className="nucleus-loading-spinner" />
          <p>Redirecting to your workspace...</p>
        </div>
      </div>
    );
  }

  // If requireAdmin is set but user is not admin
  if (requireAdmin && !isAdmin) {
    const roleLabel = ROLE_LABELS[profile.role as keyof typeof ROLE_LABELS] || profile.role;
    return (
      <div className="nucleus-access-denied">
        <div className="nucleus-access-denied-content">
          <img src="/logos/logo-icon-black.png" alt="Trailblaize" className="nucleus-access-denied-logo" />
          <h1>Founder Access Required</h1>
          <p className="nucleus-access-denied-message">
            This area is restricted to Founders and Co-Founders.
          </p>
          <p className="nucleus-access-denied-hint">
            Your current role: <strong>{roleLabel}</strong>
          </p>
          <div className="nucleus-access-denied-actions">
            <button 
              onClick={() => router.push('/workspace')} 
              className="nucleus-access-denied-btn"
            >
              Go to My Workspace
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Authorized - show content
  return <>{children}</>;
}
