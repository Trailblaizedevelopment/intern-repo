'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { supabase, ChapterWithOnboarding, ONBOARDING_STEPS } from '@/lib/supabase';

interface SetUpTabProps {
  chapter: ChapterWithOnboarding;
  onUpdate: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
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
  const colors = ['#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6', '#10b981', '#3b82f6'];
  return Array.from({ length: 50 }, (_, i) => ({
    id: i, x: Math.random() * 100, y: Math.random() * 100,
    color: colors[Math.floor(Math.random() * colors.length)],
    rotation: Math.random() * 360, scale: 0.5 + Math.random() * 0.5,
  }));
}

export default function SetUpTab({ chapter, onUpdate, showToast }: SetUpTabProps) {
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

  const saveOptOut = useCallback(async (field: 'email_outreach_enabled' | 'conversations_enabled', value: boolean) => {
    if (!supabase) return;
    const { error } = await supabase.from('chapters').update({ [field]: value }).eq('id', chapter.id);
    if (error) {
      showToast('Failed to save setting', 'error');
    } else {
      showToast('Setting saved', 'success');
      onUpdate();
    }
  }, [chapter.id, showToast, onUpdate]);

  function getProgressGradient(pct: number): string {
    if (pct < 25) return 'linear-gradient(90deg,#f97316,#fb923c)';
    if (pct < 50) return 'linear-gradient(90deg,#f59e0b,#fbbf24)';
    if (pct < 75) return 'linear-gradient(90deg,#10b981,#34d399)';
    return 'linear-gradient(90deg,#14b8a6,#2dd4bf)';
  }

  async function toggleStep(stepKey: string, categoryKey: string) {
    if (!supabase) return;

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
      const { error } = await supabase.from('chapters').update(update).eq('id', chapter.id);
      if (error) {
        // Revert optimistic update
        setLocalChapter(p => ({ ...p, [stepKey]: current }));
        if (error.message?.includes('column') || error.code === 'PGRST204') {
          showToast('Column missing — run migration to enable this step', 'error');
        } else {
          showToast('Failed to update step', 'error');
        }
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
      {/* Opt-out toggles */}
      <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.85rem', color: '#374151' }}>
          <input
            type="checkbox"
            checked={!emailOutreachEnabled}
            onChange={e => {
              const skipping = e.target.checked;
              setEmailOutreachEnabled(!skipping);
              saveOptOut('email_outreach_enabled', !skipping);
            }}
            style={{ width: 15, height: 15, cursor: 'pointer' }}
          />
          Skip email outreach for this chapter
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.85rem', color: '#374151' }}>
          <input
            type="checkbox"
            checked={!conversationsEnabled}
            onChange={e => {
              const skipping = e.target.checked;
              setConversationsEnabled(!skipping);
              saveOptOut('conversations_enabled', !skipping);
            }}
            style={{ width: 15, height: 15, cursor: 'pointer' }}
          />
          Skip Linq conversations for this chapter
        </label>
      </div>

      {/* Overall progress */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px', marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Overall Setup Progress</span>
          <span style={{ fontWeight: 700, color: overallPct >= 100 ? '#10b981' : '#6b7280' }}>{doneSteps}/{totalSteps} ({overallPct}%)</span>
        </div>
        <div style={{ height: 8, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 99,
            width: `${overallPct}%`,
            background: getProgressGradient(overallPct),
            transition: 'width 0.4s ease',
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
              <div key={category} style={{ background: '#f9fafb', border: '1px dashed #d1d5db', borderRadius: 12, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#9ca3af' }}>{CATEGORY_LABELS[category] || category}</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 10px', borderRadius: 99, background: '#e5e7eb', color: '#6b7280' }}>Opted out</span>
              </div>
            );
          }

          return (
            <div
              key={category}
              style={{
                background: '#fff',
                border: `1px solid ${isCelebrating ? '#10b981' : '#e5e7eb'}`,
                borderRadius: 12,
                padding: '16px 20px',
                transition: 'border-color 0.3s',
                boxShadow: isCelebrating ? '0 0 0 3px rgba(16,185,129,0.15)' : 'none',
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
                      width: 6, height: 6, borderRadius: 2,
                      backgroundColor: p.color,
                      transform: `rotate(${p.rotation}deg) scale(${p.scale})`,
                      animation: 'confetti-fall 0.8s ease-out forwards',
                    }} />
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                  {CATEGORY_LABELS[category] || category}
                  {isCelebrating && <span style={{ marginLeft: 8, fontSize: '0.9rem' }}>🎉</span>}
                </span>
                <span style={{
                  fontSize: '0.75rem', fontWeight: 700,
                  color: catPct === 100 ? '#065f46' : '#6b7280',
                  background: catPct === 100 ? '#d1fae5' : '#f3f4f6',
                  padding: '2px 8px', borderRadius: 99,
                }}>
                  {catDone}/{steps.length}
                </span>
              </div>

              {/* Category progress bar */}
              <div style={{ height: 4, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden', marginBottom: 14 }}>
                <div style={{
                  height: '100%', borderRadius: 99,
                  width: `${catPct}%`,
                  background: getProgressGradient(catPct),
                  transition: 'width 0.3s ease',
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
                        cursor: 'pointer', padding: '5px 6px', borderRadius: 6,
                        background: checked ? 'rgba(16,185,129,0.06)' : 'transparent',
                        transition: 'background 0.15s',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleStep(step.key, category)}
                        style={{ display: 'none' }}
                      />
                      <div style={{
                        width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                        border: `2px solid ${checked ? '#10b981' : '#d1d5db'}`,
                        background: checked ? '#10b981' : '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.2s',
                      }}>
                        {checked && <Check size={12} color="#fff" strokeWidth={3} />}
                      </div>
                      <span style={{
                        fontSize: '0.85rem',
                        color: checked ? '#374151' : '#4b5563',
                        textDecoration: checked ? 'line-through' : 'none',
                        opacity: checked ? 0.7 : 1,
                        transition: 'all 0.2s',
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

      {/* Completion Modal */}
      {showCompletionModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
          onClick={() => setShowCompletionModal(false)}
        >
          <div
            style={{ background: '#fff', borderRadius: 20, padding: '40px 48px', textAlign: 'center', position: 'relative', overflow: 'hidden', maxWidth: 420, width: '90%' }}
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
            <p style={{ color: '#6b7280', marginBottom: 8 }}>
              <strong style={{ color: '#111827' }}>{chapter.chapter_name}</strong> has completed all setup steps!
            </p>
            <p style={{ color: '#10b981', fontWeight: 600, fontSize: '0.9rem', marginBottom: 24 }}>Status automatically updated to Active.</p>
            <button
              onClick={() => setShowCompletionModal(false)}
              style={{ padding: '10px 28px', borderRadius: 10, background: '#10b981', color: '#fff', border: 'none', fontSize: '0.95rem', fontWeight: 700, cursor: 'pointer' }}
            >
              Awesome! 🎊
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
