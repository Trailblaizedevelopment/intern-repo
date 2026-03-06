'use client';

/**
 * Schools — Intern Workspace Page
 *
 * Renders the existing pipeline "Schools" tab, locked to read-only view.
 * Pulls from the same schools/organizations/pipeline_deals data as Nucleus.
 * No editing — interns can browse school → chapter → stage, but can't modify.
 */

import { ToastProvider } from '@/components/Toast';
import PipelineV2 from '@/app/nucleus/pipeline/page';

export default function SchoolsPage() {
  return (
    <ToastProvider>
      <PipelineV2 initialTab="schools" lockedTab={true} />
    </ToastProvider>
  );
}
