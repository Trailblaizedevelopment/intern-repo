'use client';

import React, { useEffect, useState } from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import { ChapterWithOnboarding } from '@/lib/supabase';
import { CS_UI, CS_CARD, SECTION_TITLE, TOOLBAR_BUTTON_PRIMARY, LIST_PILL } from '../cs-ui';

interface SalesTabProps {
  chapter: ChapterWithOnboarding;
  onUpdate: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

type SalesStepKey = 'contract' | 'payment' | 'onboarding_form';

interface SalesStepEdit {
  checked: boolean;
  date: string;
  notes: string;
  amount?: number | string;
}

interface SalesStep {
  key: SalesStepKey;
  label: string;
  icon: string;
  fields: {
    checkedKey: keyof ChapterWithOnboarding;
    dateKey: keyof ChapterWithOnboarding;
    notesKey: keyof ChapterWithOnboarding;
    amountKey?: keyof ChapterWithOnboarding;
  };
}

const INPUT: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  fontSize: '0.8125rem',
  padding: '7px 10px',
  border: `1px solid ${CS_UI.border}`,
  borderRadius: 8,
  outline: 'none',
  fontFamily: 'inherit',
  color: CS_UI.text,
  background: '#fff',
};

const SALES_STEPS: SalesStep[] = [
  {
    key: 'contract',
    label: 'Contract Signed',
    icon: '📝',
    fields: {
      checkedKey: 'contract_signed',
      dateKey: 'contract_signed_date',
      notesKey: 'contract_signed_notes',
    },
  },
  {
    key: 'payment',
    label: 'Payment Received',
    icon: '💳',
    fields: {
      checkedKey: 'payment_received',
      dateKey: 'payment_received_date',
      notesKey: 'payment_received_notes',
      amountKey: 'payment_amount_received',
    },
  },
  {
    key: 'onboarding_form',
    label: 'Onboarding Form Submitted',
    icon: '📋',
    fields: {
      checkedKey: 'onboarding_form_submitted',
      dateKey: 'onboarding_form_submitted_date',
      notesKey: 'onboarding_form_notes',
    },
  },
];

function buildEdits(chapter: ChapterWithOnboarding): Record<SalesStepKey, SalesStepEdit> {
  return {
    contract: {
      checked: !!chapter.contract_signed,
      date: chapter.contract_signed_date || '',
      notes: chapter.contract_signed_notes || '',
    },
    payment: {
      checked: !!chapter.payment_received,
      date: chapter.payment_received_date || '',
      notes: chapter.payment_received_notes || '',
      amount: chapter.payment_amount_received ?? chapter.mrr ?? '',
    },
    onboarding_form: {
      checked: !!chapter.onboarding_form_submitted,
      date: chapter.onboarding_form_submitted_date || '',
      notes: chapter.onboarding_form_notes || '',
    },
  };
}

export default function SalesTab({ chapter, onUpdate, showToast }: SalesTabProps) {
  const [saving, setSaving] = useState<string | null>(null);
  const [edits, setEdits] = useState(() => buildEdits(chapter));

  useEffect(() => {
    setEdits(buildEdits(chapter));
  }, [chapter]);

  async function saveStep(stepKey: SalesStepKey, step: SalesStep) {
    setSaving(stepKey);
    const edit = edits[stepKey];

    const update: Record<string, unknown> = {
      [step.fields.checkedKey]: edit.checked,
      [step.fields.dateKey]: edit.date || null,
      [step.fields.notesKey]: edit.notes || null,
    };
    if (step.fields.amountKey) {
      update[step.fields.amountKey] = edit.amount !== '' && edit.amount !== undefined
        ? Number(edit.amount)
        : null;
    }

    try {
      const res = await fetch(`/api/chapters/${chapter.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error || 'Failed to save', 'error');
      } else {
        showToast('Saved', 'success');
        onUpdate();
      }
    } catch (err) {
      showToast('Failed to save', 'error');
      console.error(err);
    } finally {
      setSaving(null);
    }
  }

  function updateEdit(stepKey: SalesStepKey, field: keyof SalesStepEdit, value: unknown) {
    setEdits((prev) => ({
      ...prev,
      [stepKey]: { ...prev[stepKey], [field]: value },
    }));
  }

  const contractDone = edits.contract.checked;
  const paymentDone = edits.payment.checked;
  const formDone = edits.onboarding_form.checked;
  const outOfOrder = (paymentDone && !contractDone) || (formDone && !paymentDone);

  const incompleteSteps = SALES_STEPS.filter(step => !edits[step.key].checked);
  const completedSteps = SALES_STEPS.filter(step => edits[step.key].checked);
  const sortedSteps = [...incompleteSteps, ...completedSteps];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ ...SECTION_TITLE, marginBottom: 6 }}>Post-Close Cycle Tracker</h2>
        <p style={{ margin: 0, color: CS_UI.textMuted, fontSize: '0.8125rem' }}>
          Track the three critical milestones after a chapter signs up.
        </p>
      </div>

      {outOfOrder && (
        <div style={{
          background: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: 10,
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: '0.8125rem',
          color: CS_UI.warning,
        }}>
          <AlertTriangle size={15} />
          Steps completed out of order — that&apos;s okay, just a heads up.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {sortedSteps.map((step, idx) => {
          const edit = edits[step.key];
          const isChecked = edit.checked;
          const isSaving = saving === step.key;
          const originalIdx = SALES_STEPS.findIndex(s => s.key === step.key);
          const showCompletedDivider = isChecked && (idx === 0 || !edits[sortedSteps[idx - 1].key].checked);

          return (
            <React.Fragment key={step.key}>
              {showCompletedDivider && completedSteps.length > 0 && incompleteSteps.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0' }}>
                  <div style={{ flex: 1, height: 1, background: CS_UI.border }} />
                  <span style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: CS_UI.textSubtle }}>
                    Completed
                  </span>
                  <div style={{ flex: 1, height: 1, background: CS_UI.border }} />
                </div>
              )}
              <div
                style={{
                  ...CS_CARD,
                  background: isChecked ? CS_UI.surfaceMuted : CS_UI.surface,
                  borderLeft: `3px solid ${isChecked ? CS_UI.ink : CS_UI.border}`,
                  padding: '14px 16px',
                  opacity: isChecked ? 0.85 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <button
                      type="button"
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: isChecked ? CS_UI.ink : CS_UI.surfaceMuted,
                        border: `2px solid ${isChecked ? CS_UI.ink : CS_UI.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        flexShrink: 0,
                        padding: 0,
                      }}
                      onClick={() => updateEdit(step.key, 'checked', !isChecked)}
                      aria-label={isChecked ? `Mark ${step.label} incomplete` : `Mark ${step.label} complete`}
                    >
                      {isChecked
                        ? <Check size={16} color="#fff" strokeWidth={3} />
                        : <span style={{ color: CS_UI.textMuted, fontWeight: 600 }}>{originalIdx + 1}</span>}
                    </button>
                    {idx < sortedSteps.length - 1 && (
                      <div style={{ width: 2, height: 20, background: CS_UI.border }} />
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '1rem' }}>{step.icon}</span>
                      <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: isChecked ? CS_UI.textMuted : CS_UI.text }}>
                        {step.label}
                      </span>
                      {isChecked && (
                        <span style={{ ...LIST_PILL, background: '#ecfdf5', color: CS_UI.success, border: '1px solid #6ee7b7' }}>
                          Complete
                        </span>
                      )}
                    </div>

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: step.fields.amountKey ? '1fr 1fr 1fr' : '1fr 2fr',
                      gap: 10,
                      marginBottom: 12,
                    }}>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: CS_UI.textMuted, display: 'block', marginBottom: 4 }}>
                          Date
                        </label>
                        <input
                          type="date"
                          value={edit.date}
                          onChange={e => updateEdit(step.key, 'date', e.target.value)}
                          style={INPUT}
                        />
                      </div>
                      {step.fields.amountKey && (
                        <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: CS_UI.textMuted, display: 'block', marginBottom: 4 }}>
                            Amount ($)
                          </label>
                          <input
                            type="number"
                            value={edit.amount ?? ''}
                            onChange={e => updateEdit(step.key, 'amount', e.target.value)}
                            placeholder="299"
                            style={INPUT}
                          />
                        </div>
                      )}
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: CS_UI.textMuted, display: 'block', marginBottom: 4 }}>
                          Notes
                        </label>
                        <input
                          type="text"
                          value={edit.notes}
                          onChange={e => updateEdit(step.key, 'notes', e.target.value)}
                          placeholder="Any notes…"
                          style={INPUT}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => saveStep(step.key, step)}
                      disabled={isSaving}
                      style={{ ...TOOLBAR_BUTTON_PRIMARY, padding: '0 14px', height: 32, opacity: isSaving ? 0.7 : 1 }}
                    >
                      {isSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
