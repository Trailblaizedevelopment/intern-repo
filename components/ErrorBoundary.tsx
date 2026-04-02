'use client';

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  section?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary — catches uncaught errors in child component trees.
 * Use this to wrap major sections within a page so one bad component
 * doesn't crash the whole UI.
 *
 * Usage:
 *   <ErrorBoundary section="Outreach Stats">
 *     <OutreachStatsSection />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.section ? ` — ${this.props.section}` : ''}]`, error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="error-boundary-fallback">
          <AlertTriangle size={20} className="error-boundary-icon" />
          <div className="error-boundary-body">
            <p className="error-boundary-title">
              {this.props.section ? `${this.props.section} failed to load` : 'Something went wrong'}
            </p>
            <p className="error-boundary-message">
              {this.state.error?.message ?? 'An unexpected error occurred.'}
            </p>
          </div>
          <button className="error-boundary-retry" onClick={this.handleReset}>
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
