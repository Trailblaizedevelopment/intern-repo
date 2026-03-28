'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Clock, X, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

interface ChapterSetupStatus {
  id: string;
  chapter_name: string;
  school?: string | null;
  status?: string | null;
  wizard_step?: number;
  wizard_completed_at?: string | null;
  created_at: string;
}

interface ToastNotification {
  id: string;
  message: string;
}

interface OnboardingNotificationsProps {
  chapters: ChapterSetupStatus[];
  onOpenWizard: (chapterId: string) => void;
}

// Human-readable label for each wizard step (step = what's happening NOW / what's pending)
const STEP_LABELS: Record<number, string> = {
  1: 'Step 1 of 5 — Awaiting chapter info',
  2: 'Step 2 of 5 — Awaiting contract signature',
  3: 'Step 3 of 5 — Awaiting invoice payment',
  4: 'Step 4 of 5 — Awaiting submission form',
  5: 'Step 5 of 5 — Finalising setup',
};

function getStepLabel(step?: number): string {
  if (!step) return 'Step 1 of 5 — Awaiting chapter info';
  return STEP_LABELS[step] ?? `Step ${step} of 5`;
}

export default function OnboardingNotifications({
  chapters,
  onOpenWizard,
}: OnboardingNotificationsProps) {
  // Show chapters that are active/onboarding AND haven't finished the wizard.
  // This ensures existing active chapters surface here, not just newly created ones.
  // Explicitly exclude churned chapters — they don't need onboarding follow-up.
  const incomplete = chapters.filter(
    c => !c.wizard_completed_at && c.status !== 'churned',
  );

  // Track previous state to detect step completions → fire toasts
  const prevChaptersRef = useRef<ChapterSetupStatus[]>([]);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  useEffect(() => {
    const prev = prevChaptersRef.current;

    if (prev.length > 0) {
      // Detect wizard step advancement on previously-incomplete chapters
      chapters.forEach(curr => {
        const old = prev.find(p => p.id === curr.id);
        if (!old) return;

        const wasIncomplete = !old.wizard_completed_at;
        const nowComplete = !!curr.wizard_completed_at;
        const stepAdvanced = (curr.wizard_step ?? 1) > (old.wizard_step ?? 1);

        if (wasIncomplete && (nowComplete || stepAdvanced)) {
          const name = curr.chapter_name;
          let event = 'Setup advanced';

          if (nowComplete) {
            event = 'Setup complete! 🎉';
          } else {
            const step = curr.wizard_step ?? 1;
            const events: Record<number, string> = {
              2: 'Contract sent',
              3: 'Contract signed',
              4: 'Invoice sent',
              5: 'Submission form sent',
            };
            event = events[step] ?? `Step ${step} reached`;
          }

          const id = `${curr.id}-${Date.now()}`;
          setToasts(t => [...t, { id, message: `✅ ${name} — ${event}` }]);
          setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000);
        }
      });
    }

    prevChaptersRef.current = chapters;
  }, [chapters]);

  function dismissToast(id: string) {
    setToasts(t => t.filter(x => x.id !== id));
  }

  if (incomplete.length === 0 && toasts.length === 0) return null;

  return (
    <>
      {/* Persistent panel — disappears when all chapters complete */}
      {incomplete.length > 0 && (
        <div style={{
          background: '#FEF9EE',
          border: '1px solid #F5DFA0',
          borderRadius: 12,
          padding: '14px 18px',
          marginBottom: 20,
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <AlertTriangle size={16} color="#C4874A" />
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1B2A4A' }}>
              ⚠️ {incomplete.length} chapter{incomplete.length !== 1 ? 's' : ''} need{incomplete.length === 1 ? 's' : ''} setup
            </span>
          </div>

          {/* Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {incomplete.map(chapter => {
              const daysSinceCreated = Math.floor(
                (Date.now() - new Date(chapter.created_at).getTime()) / 86400000,
              );
              const step = chapter.wizard_step ?? 1;
              const stepBadgeColor = step >= 4
                ? { bg: '#EAF5EA', color: '#2A6A2A' }
                : step >= 2
                ? { bg: '#FEF9EE', color: '#8A6030' }
                : { bg: '#F0EDEA', color: '#6B5848' };

              return (
                <div
                  key={chapter.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: '#fff',
                    border: '1px solid #E5E0D8',
                    gap: 10,
                  }}
                >
                  {/* Left: info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1B2A4A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {chapter.chapter_name}
                      {chapter.school ? (
                        <span style={{ fontWeight: 400, color: '#8A7E72', marginLeft: 6 }}>· {chapter.school}</span>
                      ) : null}
                    </div>
                    <div style={{
                      fontSize: '0.75rem',
                      color: '#8A7E72',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      marginTop: 3,
                    }}>
                      <Clock size={12} />
                      {getStepLabel(step)}
                      &nbsp;·&nbsp;
                      {daysSinceCreated === 0 ? 'Created today' : `${daysSinceCreated}d ago`}
                    </div>
                  </div>

                  {/* Right: badge + link */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: 20,
                      background: stepBadgeColor.bg,
                      color: stepBadgeColor.color,
                    }}>
                      {step}/5
                    </span>
                    <button
                      onClick={() => onOpenWizard(chapter.id)}
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: '#C4874A',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        whiteSpace: 'nowrap',
                        textDecoration: 'underline',
                        textUnderlineOffset: 2,
                      }}
                    >
                      Continue Setup →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Toast stack — green dismissible notifications */}
      {toasts.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'none',
        }}>
          {toasts.map(toast => (
            <div
              key={toast.id}
              onClick={() => dismissToast(toast.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: '#1A3A2A',
                color: '#D4F0E0',
                border: '1px solid #2A6040',
                borderRadius: 10,
                padding: '11px 16px',
                fontSize: '0.875rem',
                fontWeight: 500,
                boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
                cursor: 'pointer',
                pointerEvents: 'all',
                animation: 'toast-slide-in 0.25s ease-out',
                maxWidth: 380,
              }}
            >
              <CheckCircle2 size={16} color="#4ADE80" style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{toast.message}</span>
              <X size={14} color="#6EBD94" style={{ flexShrink: 0 }} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
