'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Check, CheckCircle2, Clock, Sparkles, Wand2 } from 'lucide-react';
import { ChapterWithOnboarding, ONBOARDING_STEPS } from '@/lib/supabase';
import { CS_UI, CS_CARD, NEUTRAL_BADGE, TOOLBAR_BUTTON_PRIMARY } from '../cs-ui';

interface SetUpTabProps {
  chapter: ChapterWithOnboarding;
  onUpdate: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  /** Called when user clicks "Continue Setup" — opens wizard for this chapter */
  onOpenWizard?: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  setup: '🚀 Setup',
  activation: '🔔 Alumni Activation',
  data: '📊 Data Import',
  linq: '📱 Linq Outreach',
  email: '📧 Email Outreach',
  success_setup: '✅ Success Activation',
};

interface ConfettiParticle {
  id: number; x: number; y: number;
  color: string; rotation: number; scale: number;
}

function generateConfetti(): ConfettiParticle[] {
  const colors = ['#2563eb', '#1d4ed8', '#059669', '#0F172A', '#6b7280', '#d97706'];
  return Array.from({ length: 50 }, (_, i) => ({
    id: i, x: Math.random() * 100, y: Math.random() * 100,
    color: colors[Math.floor(Math.random() * colors.length)],
    rotation: Math.random() * 360, scale: 0.5 + Math.random() * 0.5,
  }));
}

export default function SetUpTab({ chapter, onUpdate, showToast, onOpenWizard }: SetUpTabProps) {
  const [localChapter, setLocalChapter] = useState<ChapterWithOnboarding>(chapter);
  const [celebratingCategory, setCelebratingCategory] = useState<string | null>(null);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [confetti] = useState(() => generateConfetti());

  // Opt-out toggles
  const [emailOutreachEnabled, setEmailOutreachEnabled] = useState(chapter.email_outreach_enabled !== false);
  const [conversationsEnabled, setConversationsEnabled] = useState(chapter.conversations_enabled !== false);

  useEffect(() => {
    setLocalChapter(chapter);
    setEmailOutreachEnabled(chapter.email_outreach_enabled !== false);
    setConversationsEnabled(chapter.conversations_enabled !== false);
  }, [chapter]);

  // ── Auto-complete check on page load ──────────────────────────────────────
  // If onboarding_completed is null but every step is already checked, mark it.
  useEffect(() => {
    if (chapter.onboarding_completed) return; // already done

    const allKeys = ONBOARDING_STEPS.map(s => s.key);
    const allDone = allKeys.every(k => chapter[k as keyof ChapterWithOnboarding]);
    if (!allDone) return;

    const completion = new Date().toISOString().split('T')[0];
    fetch(`/api/chapters/${chapter.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboarding_completed: completion, status: 'active' }),
    }).then(r => r.ok && onUpdate());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter.id]);

  const saveOptOut = useCallback(async (field: 'email_outreach_enabled' | 'conversations_enabled', value: boolean) => {
    try {
      const res = await fetch(`/api/chapters/${chapter.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) {
        showToast('Failed to save setting', 'error');
      } else {
        showToast('Setting saved', 'success');
        onUpdate();
      }
    } catch {
      showToast('Failed to save setting', 'error');
    }
  }, [chapter.id, showToast, onUpdate]);

  function getProgressGradient(pct: number): string {
    if (pct < 50) return CS_UI.warning;
    if (pct < 100) return CS_UI.blue;
    return CS_UI.success;
  }

  async function toggleStep(stepKey: string, categoryKey: string) {
    const current = localChapter[stepKey as keyof ChapterWithOnboarding];
    const next = !current;

    // Optimistic update
    setLocalChapter(p => ({ ...p, [stepKey]: next }));

    const allKeys = ONBOARDING_STEPS.map(s => s.key);
    const doneCount = allKeys.filter(k => k === stepKey ? next : localChapter[k as keyof ChapterWithOnboarding]).length;

    const catSteps = ONBOARDING_STEPS.filter(s => s.category === categoryKey);
    const catComplete = catSteps.every(s =>
      s.key === stepKey ? next : localChapter[s.key as keyof ChapterWithOnboarding]
    );

    const update: Record<string, unknown> = {
      [stepKey]: next,
      last_activity: new Date().toISOString().split('T')[0],
    };

    if (doneCount === allKeys.length) {
      update.status = 'active';
      update.onboarding_completed = new Date().toISOString().split('T')[0];
    }

    try {
      const res = await fetch(`/api/chapters/${chapter.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      if (!res.ok) {
        // Revert optimistic update
        setLocalChapter(p => ({ ...p, [stepKey]: current }));
        const json = await res.json().catch(() => ({}));
        showToast(json.error || 'Failed to update step', 'error');
      } else {
        if (next) {
          const label = ONBOARDING_STEPS.find(s => s.key === stepKey)?.label;
          showToast(`✓ ${label}`, 'success');
        }
        if (catComplete && next) {
          setCelebratingCategory(categoryKey);
          setTimeout(() => setCelebratingCategory(null), 2500);
        }
        if (doneCount === allKeys.length && next) {
          setShowCompletionModal(true);
        }
        onUpdate();
      }
    } catch (err) {
      setLocalChapter(p => ({ ...p, [stepKey]: current }));
      showToast('Failed to update step', 'error');
      console.error(err);
    }
  }

  // Group by category
  const categories = Array.from(new Set(ONBOARDING_STEPS.map(s => s.category)));

  const totalSteps = ONBOARDING_STEPS.length;
  const doneSteps = ONBOARDING_STEPS.filter(s => localChapter[s.key as keyof ChapterWithOnboarding]).length;
  const overallPct = Math.round((doneSteps / totalSteps) * 100);

  return (
    <div style={{ maxWidth: 720 }}>
      {/* ── Continue Setup banner — shown if wizard not yet completed ── */}
      {!chapter.wizard_completed_at && onOpenWizard && (
        <div style={{
          ...CS_CARD,
          padding: '14px 16px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Wand2 size={18} color={CS_UI.blue} />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', color: CS_UI.text }}>
                Onboarding wizard not completed
              </div>
              <div style={{ fontSize: '0.75rem', color: CS_UI.textMuted, marginTop: 2 }}>
                {chapter.wizard_step
                  ? `Paused at step ${chapter.wizard_step} of 5 — pick up where you left off`
                  : 'Use the guided wizard to track contract, invoice, and submission'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenWizard}
            style={{ ...TOOLBAR_BUTTON_PRIMARY, padding: '0 16px' }}
          >
            Continue Setup →
          </button>
        </div>
      )}

      {/* Step skip toggles — mark entire setup sections as N/A */}
      <div style={{ ...CS_CARD, padding: '12px 16px', marginBottom: 16, background: CS_UI.surfaceMuted }}>
        <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: CS_UI.textSubtle, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          Skip Setup Sections (mark as N/A)
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          <label
            title="Check this if Email Outreach is not applicable to this chapter — hides those setup steps from the checklist."
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.8125rem', color: CS_UI.textSecondary }}
          >
            <input
              type="checkbox"
              checked={!emailOutreachEnabled}
              onChange={e => {
                const skipping = e.target.checked;
                setEmailOutreachEnabled(!skipping);
                saveOptOut('email_outreach_enabled', !skipping);
              }}
              style={{ width: 15, height: 15, cursor: 'pointer', accentColor: CS_UI.ink }}
            />
            Email Outreach steps — not applicable to this chapter
          </label>
          <label
            title="Check this if Linq Outreach is not applicable to this chapter — hides those setup steps from the checklist."
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.8125rem', color: CS_UI.textSecondary }}
          >
            <input
              type="checkbox"
              checked={!conversationsEnabled}
              onChange={e => {
                const skipping = e.target.checked;
                setConversationsEnabled(!skipping);
                saveOptOut('conversations_enabled', !skipping);
              }}
              style={{ width: 15, height: 15, cursor: 'pointer', accentColor: CS_UI.ink }}
            />
            Linq Outreach steps — not applicable to this chapter
          </label>
        </div>
        <div style={{ fontSize: '0.75rem', color: CS_UI.textSubtle, marginTop: 6 }}>
          Checking a box marks that entire setup section as N/A and bypasses it in the onboarding flow.
        </div>
      </div>

      {/* Overall progress */}
      <div style={{ ...CS_CARD, padding: '14px 16px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontWeight: 600, fontSize: '0.875rem', color: CS_UI.text }}>Overall Setup Progress</span>
          <span style={{ fontWeight: 600, color: overallPct >= 100 ? CS_UI.success : CS_UI.textSecondary, fontSize: '0.8125rem' }}>{doneSteps}/{totalSteps} ({overallPct}%)</span>
        </div>
        <div style={{ height: 6, background: CS_UI.border, borderRadius: 9999, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2,
            width: `${overallPct}%`,
            background: getProgressGradient(overallPct),
            transition: 'width 0.15s ease-out',
          }} />
        </div>
      </div>

      {/* Categories */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {categories.map(category => {
          const steps = ONBOARDING_STEPS.filter(s => s.category === category);
          const catDone = steps.filter(s => localChapter[s.key as keyof ChapterWithOnboarding]).length;
          const catPct = Math.round((catDone / steps.length) * 100);
          const isCelebrating = celebratingCategory === category;

          // Opt-out collapse
          const isOptedOut = (category === 'email' && !emailOutreachEnabled) || (category === 'linq' && !conversationsEnabled);
          if (isOptedOut) {
            return (
              <div key={category} style={{ ...CS_CARD, padding: '12px 16px', background: CS_UI.surfaceMuted, borderStyle: 'dashed', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, fontSize: '0.875rem', color: CS_UI.textSubtle }}>{CATEGORY_LABELS[category] || category}</span>
                <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px', borderRadius: 9999, background: NEUTRAL_BADGE.bg, color: NEUTRAL_BADGE.color, border: `1px solid ${NEUTRAL_BADGE.border}` }}>Skipped (N/A)</span>
              </div>
            );
          }

          return (
            <div
              key={category}
              style={{
                ...CS_CARD,
                padding: '14px 16px',
                border: `1px solid ${isCelebrating ? CS_UI.success : CS_UI.border}`,
                transition: 'border-color 0.15s ease-out',
                boxShadow: isCelebrating ? '0 0 0 3px rgba(5,150,105,0.1)' : 'none',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {isCelebrating && (
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                  {confetti.slice(0, 20).map(p => (
                    <div key={p.id} style={{
                      position: 'absolute',
                      left: `${p.x}%`, top: `${p.y}%`,
                      width: 5, height: 5, borderRadius: 1,
                      backgroundColor: p.color,
                      transform: `rotate(${p.rotation}deg) scale(${p.scale})`,
                      animation: 'confetti-fall 0.8s ease-out forwards',
                    }} />
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontWeight: 600, fontSize: '0.875rem', color: CS_UI.text }}>
                  {CATEGORY_LABELS[category] || category}
                  {isCelebrating && <span style={{ marginLeft: 8, fontSize: '0.9rem' }}>🎉</span>}
                </span>
                <span style={{
                  fontSize: '0.68rem', fontWeight: 600,
                  color: catPct === 100 ? CS_UI.success : CS_UI.textSecondary,
                  background: catPct === 100 ? '#ecfdf5' : CS_UI.surfaceMuted,
                  padding: '2px 8px', borderRadius: 9999,
                }}>
                  {catDone}/{steps.length}
                </span>
              </div>

              {/* Category progress bar */}
              <div style={{ height: 4, background: CS_UI.border, borderRadius: 9999, overflow: 'hidden', marginBottom: 14 }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  width: `${catPct}%`,
                  background: getProgressGradient(catPct),
                  transition: 'width 0.15s ease-out',
                }} />
              </div>

              {/* Steps */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {steps.map(step => {
                  const checked = !!localChapter[step.key as keyof ChapterWithOnboarding];
                  return (
                    <label
                      key={step.key}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        cursor: 'pointer', padding: '5px 6px', borderRadius: 8,
                        background: checked ? CS_UI.blueBg : 'transparent',
                        transition: 'background 0.15s ease-out',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleStep(step.key, category)}
                        style={{ display: 'none' }}
                      />
                      <div style={{
                        width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                        border: `2px solid ${checked ? CS_UI.ink : CS_UI.border}`,
                        background: checked ? CS_UI.ink : '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s ease-out',
                      }}>
                        {checked && <Check size={11} color="#fff" strokeWidth={3} />}
                      </div>
                      <span style={{
                        fontSize: '0.8125rem',
                        color: checked ? CS_UI.textMuted : CS_UI.text,
                        textDecoration: checked ? 'line-through' : 'none',
                        opacity: checked ? 0.65 : 1,
                        transition: 'all 0.15s ease-out',
                      }}>
                        {step.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Activation Timeline ── */}
      <ActivationTimeline chapter={localChapter} />

      {/* Completion Modal */}
      {showCompletionModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
          onClick={() => setShowCompletionModal(false)}
        >
          <div
            style={{ ...CS_CARD, padding: '32px 40px', textAlign: 'center', position: 'relative', overflow: 'hidden', maxWidth: 420, width: '90%', borderRadius: 16 }}
            onClick={e => e.stopPropagation()}
          >
            {/* Confetti */}
            {confetti.map(p => (
              <div key={p.id} style={{
                position: 'absolute',
                left: `${p.x}%`, top: `${p.y}%`,
                width: 8, height: 8, borderRadius: 3,
                backgroundColor: p.color,
                transform: `rotate(${p.rotation}deg) scale(${p.scale})`,
              }} />
            ))}
            <div style={{ fontSize: '3rem', marginBottom: 12 }}><Sparkles size={48} style={{ color: '#f59e0b' }} /></div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 8 }}>🎉 Setup Complete!</h2>
            <p style={{ color: CS_UI.textMuted, marginBottom: 8 }}>
              <strong style={{ color: CS_UI.text }}>{chapter.chapter_name}</strong> has completed all setup steps!
            </p>
            <p style={{ color: CS_UI.success, fontWeight: 600, fontSize: '0.875rem', marginBottom: 24 }}>Status automatically updated to Active.</p>
            <button
              type="button"
              onClick={() => setShowCompletionModal(false)}
              style={{ ...TOOLBAR_BUTTON_PRIMARY, padding: '0 24px', height: 40 }}
            >
              Awesome! 🎊
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Activation Timeline
// ─────────────────────────────────────────────────────────────────────────────

function fmtDate(ts: string | null | undefined): string | null {
  if (!ts) return null;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface TimelineMilestone {
  label: string;
  /** Timestamp string → show formatted date. null → pending. */
  date: string | null;
  /** For boolean-only fields: true = complete, false = pending. Only used when date is not relevant. */
  boolDone?: boolean;
  /** If true, this row is boolean-only (no real timestamp). */
  boolOnly?: boolean;
}

function ActivationTimeline({ chapter }: { chapter: ChapterWithOnboarding }) {
  const milestones: TimelineMilestone[] = [
    {
      label: 'Chapter created',
      date: chapter.created_at ?? null,
    },
    {
      label: 'Contract sent',
      date: chapter.contract_sent_at ?? null,
    },
    {
      label: 'Contract signed',
      date: chapter.contract_signed_at ?? null,
    },
    {
      label: 'Invoice sent',
      date: chapter.invoice_sent_at ?? null,
    },
    {
      label: 'Invoice paid',
      date: chapter.invoice_paid_at ?? null,
    },
    {
      label: 'Submission form sent',
      date: chapter.submission_sent_at ?? null,
    },
    {
      label: 'Submission received',
      date: chapter.onboarding_submitted_at ?? null,
    },
    {
      label: 'Alumni list uploaded',
      boolOnly: true,
      date: null,
      boolDone: !!(chapter as ChapterWithOnboarding & { data_list_uploaded?: boolean }).data_list_uploaded,
    },
    {
      label: 'Touch 1 sent',
      boolOnly: true,
      date: null,
      boolDone: !!(chapter as ChapterWithOnboarding & { linq_touch1_sent?: boolean }).linq_touch1_sent,
    },
    {
      label: 'Touch 2 sent',
      boolOnly: true,
      date: null,
      boolDone: !!(chapter as ChapterWithOnboarding & { linq_touch2_sent?: boolean }).linq_touch2_sent,
    },
    {
      label: 'Touch 3 sent',
      boolOnly: true,
      date: null,
      boolDone: !!(chapter as ChapterWithOnboarding & { linq_touch3_sent?: boolean }).linq_touch3_sent,
    },
    {
      label: '100+ alumni signed up',
      boolOnly: true,
      date: null,
      boolDone: !!(chapter as ChapterWithOnboarding & { linq_100_signups?: boolean }).linq_100_signups,
    },
    {
      label: 'Setup complete',
      date: chapter.wizard_completed_at ?? null,
    },
  ];

  return (
    <div style={{ marginTop: 32 }}>
      {/* Section header */}
      <div style={{
        fontSize: '0.6875rem',
        fontWeight: 600,
        color: CS_UI.textSubtle,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: 14,
      }}>
        Activation Timeline
      </div>

      <div style={{ ...CS_CARD, padding: '4px 0' }}>
        {milestones.map((m, i) => {
          const done = m.boolOnly ? !!m.boolDone : !!m.date;
          const isLast = i === milestones.length - 1;

          return (
            <div
              key={m.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '9px 16px',
                borderBottom: isLast ? 'none' : `1px solid ${CS_UI.border}`,
              }}
            >
              {/* Icon */}
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                {done
                  ? <CheckCircle2 size={16} color={CS_UI.success} strokeWidth={2} />
                  : <Clock size={16} color={CS_UI.textSubtle} strokeWidth={1.8} />}
              </div>

              {/* Label */}
              <span style={{
                flex: 1,
                fontSize: '0.8125rem',
                color: done ? CS_UI.text : CS_UI.textSubtle,
                fontWeight: done ? 500 : 400,
              }}>
                {m.label}
              </span>

              {/* Date / status */}
              <span style={{
                fontSize: '0.78rem',
                fontWeight: done ? 600 : 400,
                color: done ? CS_UI.success : CS_UI.textSubtle,
                flexShrink: 0,
                minWidth: 80,
                textAlign: 'right',
              }}>
                {done
                  ? (m.boolOnly ? '✓ Complete' : (fmtDate(m.date) ?? '✓ Complete'))
                  : 'Pending'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
