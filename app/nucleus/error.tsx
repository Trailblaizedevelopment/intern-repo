'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';

export default function NucleusError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Nucleus Error]', error);
  }, [error]);

  return (
    <div className="error-page">
      <div className="error-page-card">
        <div className="error-page-icon-wrap">
          <AlertTriangle size={32} className="error-page-icon" />
        </div>
        <h1 className="error-page-title">Something went wrong</h1>
        <p className="error-page-message">
          {error.message || 'An unexpected error occurred in Nucleus.'}
        </p>
        {error.digest && (
          <p className="error-page-digest">Error ID: {error.digest}</p>
        )}
        <div className="error-page-actions">
          <button className="error-page-btn-primary" onClick={reset}>
            <RefreshCw size={15} />
            Try again
          </button>
          <a className="error-page-btn-secondary" href="/nucleus">
            <ArrowLeft size={15} />
            Back to Nucleus
          </a>
        </div>
      </div>
    </div>
  );
}
