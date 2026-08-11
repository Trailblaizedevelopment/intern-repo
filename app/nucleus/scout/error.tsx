'use client';

import { AlertCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function ScoutError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="module-page">
      <div className="module-empty-state">
        <AlertCircle size={48} />
        <h3>Something went wrong</h3>
        <p>{error.message || 'An unexpected error occurred in Scout.'}</p>
        <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
          <button className="module-primary-btn" onClick={reset}>
            Try again
          </button>
          <Link href="/nucleus/scout" className="module-filter-btn" style={{ textDecoration: 'none' }}>
            <ArrowLeft size={16} />
            Back to Scout
          </Link>
        </div>
      </div>
    </div>
  );
}
