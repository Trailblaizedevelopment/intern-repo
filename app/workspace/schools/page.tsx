'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Schools page — redirects to Sales Room CRM.
 * Pipeline page was removed 2026-06-23. Sales Room is the single source of truth.
 */
export default function SchoolsPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/nucleus/war-room'); }, [router]);
  return <div style={{ padding: 40, color: '#6b7280' }}>Redirecting to Sales Room…</div>;
}
