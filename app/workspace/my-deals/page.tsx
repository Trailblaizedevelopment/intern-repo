'use client';

/**
 * My Deals — Intern Workspace Page
 *
 * Renders the existing pipeline "My Deals" tab, locked to the current user's
 * assigned deals only. All CRUD (add, edit, stage advance, follow-up) is the
 * exact same functionality as /nucleus/pipeline — no duplicate logic.
 */

import { ToastProvider } from '@/components/Toast';
import PipelineV2 from '@/app/nucleus/pipeline/page';

export default function MyDealsPage() {
  return (
    <ToastProvider>
      <PipelineV2 initialTab="my-deals" lockedTab={true} />
    </ToastProvider>
  );
}
