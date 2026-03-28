'use client';

import React from 'react';
import { AlertTriangle, Clock } from 'lucide-react';

interface ChapterSetupStatus {
  id: string;
  chapter_name: string;
  wizard_step?: number;
  wizard_completed_at?: string | null;
  created_at: string;
}

interface OnboardingNotificationsProps {
  chapters: ChapterSetupStatus[];
  onOpenWizard: (chapterId: string) => void;
}

const STEP_LABELS: Record<number, string> = {
  1: 'Step 1 — Chapter Info',
  2: 'Step 2 — Send Contract',
  3: 'Step 3 — Invoice',
  4: 'Step 4 — Submission Form',
  5: 'Step 5 — Done',
};

export default function OnboardingNotifications({ chapters, onOpenWizard }: OnboardingNotificationsProps) {
  const incomplete = chapters.filter(c => !c.wizard_completed_at);

  if (incomplete.length === 0) return null;

  return (
    <div style={{
      background: '#FEF9EE',
      border: '1px solid #F5DFA0',
      borderRadius: 12,
      padding: '14px 18px',
      marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <AlertTriangle size={16} color="#C4874A" />
        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1B2A4A' }}>
          ⚠️ {incomplete.length} chapter{incomplete.length !== 1 ? 's' : ''} need{incomplete.length === 1 ? 's' : ''} setup
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {incomplete.map(chapter => {
          const daysSinceCreated = Math.floor(
            (Date.now() - new Date(chapter.created_at).getTime()) / 86400000,
          );
          const step = chapter.wizard_step || 1;

          return (
            <button
              key={chapter.id}
              onClick={() => onOpenWizard(chapter.id)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 12px', borderRadius: 8,
                background: '#fff', border: '1px solid #E5E0D8',
                cursor: 'pointer', textAlign: 'left',
                transition: 'border-color 0.15s',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1B2A4A' }}>
                  {chapter.chapter_name}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#8A7E72', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <Clock size={12} />
                  {STEP_LABELS[step] || `Step ${step}`}
                  &nbsp;·&nbsp;
                  {daysSinceCreated === 0 ? 'Created today' : `${daysSinceCreated}d ago`}
                </div>
              </div>
              <div style={{
                fontSize: '0.72rem', fontWeight: 700,
                padding: '3px 8px', borderRadius: 20,
                background: step >= 4 ? '#EAF5EA' : step >= 2 ? '#FEF9EE' : '#F0EDEA',
                color: step >= 4 ? '#2A6A2A' : step >= 2 ? '#8A6030' : '#6B5848',
              }}>
                {step}/5
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
