'use client';

import React, { useState } from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import { ChapterWithOnboarding } from '@/lib/supabase';
import { CS_UI, CS_CARD, TOOLBAR_BUTTON_PRIMARY } from '../cs-ui';

interface SalesTabProps {
  chapter: ChapterWithOnboarding;
  onUpdate: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface SalesStep {
  key: string;
  label: string;
  icon: string;
  fields: {
    checkedKey: keyof ChapterWithOnboarding;
    dateKey: keyof ChapterWithOnboarding;
    notesKey: keyof ChapterWithOnboarding;
    amountKey?: keyof ChapterWithOnboarding;
  };
}

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

export default function SalesTab({ chapter, onUpdate, showToast }: SalesTabProps) {
  const [saving, setSaving] = useState<string | null>(null);

  // Local edit state for each step
  const [edits, setEdits] = useState<Record<string, {
    checked: boolean;
    date: string;
    notes: string;
    amount?: number | '';
  }>>({
    contract: {
      checked: !!chapter.contract_signed,
      date: chapter.contract_signed_date || '',
      notes: chapter.contract_signed_notes || '',
    },
    payment: {
      checked: !!chapter.payment_received,
      date: chapter.payment_received_date || '',
      notes: chapter.payment_received_notes || '',
      amount: chapter.payment_amount_received ?? '',
    },
    onboarding_form: {
      checked: !!chapter.onboarding_form_submitted,
      date: chapter.onboarding_form_submitted_date || '',
      notes: chapter.onboarding_form_notes || '',
    },
  });

  async function saveStep(stepKey: string, step: SalesStep) {
    setSaving(stepKey);
    const edit = edits[stepKey];

    const update: Record<string, unknown> = {
      [step.fields.checkedKey]: edit.checked,
      [step.fields.dateKey]: edit.date || null,
      [step.fields.notesKey]: edit.notes || null,
    };
    if (step.fields.amountKey) {
      update[step.fields.amountKey] = edit.amount !== '' ? Number(edit.amount) : null;
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

  function updateEdit(stepKey: string, field: string, value: unknown) {
    setEdits(p => ({ ...p, [stepKey]: { ...p[stepKey], [field]: value } }));
  }

  // Check if steps are completed in order for soft warning
  const contractDone = edits.contract.checked;
  const paymentDone = edits.payment.checked;
  const formDone = edits.onboarding_form.checked;

  const outOfOrder = (paymentDone && !contractDone) || (formDone && !paymentDone);

  // Split steps into incomplete and completed
  const incompleteSteps = SALES_STEPS.filter(step => !edits[step.key].checked);
  const completedSteps = SALES_STEPS.filter(step => edits[step.key].checked);
  const sortedSteps = [...incompleteSteps, ...completedSteps];

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontWeight: 600, fontSize: '0.9375rem', marginBottom: 6, color: CS_UI.text }}>Post-Close Cycle Tracker</h2>
        <p style={{ color: CS_UI.textMuted, fontSize: '0.8125rem' }}>
          Track the three critical milestones after a chapter signs up.
        </p>
      </div>

      {outOfOrder && (
        <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 10, padding: '10px 14px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: '#92400e' }}>
          <AlertTriangle size={15} />
          Steps completed out of order — that&apos;s okay, just a heads up.
        </div>
      )}

      {/* Timeline stepper — incomplete first, completed sink to bottom */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {sortedSteps.map((step, idx) => {
          const edit = edits[step.key];
          const isChecked = edit.checked;
          const isSaving = saving === step.key;
          // Original step index for numbering
          const originalIdx = SALES_STEPS.findIndex(s => s.key === step.key);
          // Show "Completed" divider before first completed step
          const showCompletedDivider = isChecked && (idx === 0 || !edits[sortedSteps[idx - 1].key].checked);

          return (
            <React.Fragment key={step.key}>
              {showCompletedDivider && completedSteps.length > 0 && incompleteSteps.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0' }}>
                  <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af' }}>Completed</span>
                  <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
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
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: isChecked ? CS_UI.ink : CS_UI.surfaceMuted,
                    border: `2px solid ${isChecked ? CS_UI.ink : CS_UI.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                    onClick={() => updateEdit(step.key, 'checked', !isChecked)}
                  >
                    {isChecked ? <Check size={16} color="#fff" strokeWidth={3} /> : <span style={{ color: CS_UI.textMuted, fontWeight: 600 }}>{originalIdx + 1}</span>}
                  </div>
                  {idx < sortedSteps.length - 1 && (
                    <div style={{ width: 2, height: 20, background: '#e5e7eb', margin: '0 auto' }} />
                  )}
                </div>

                {/* Content */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <span style={{ fontSize: '1rem' }}>{step.icon}</span>
                    <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: isChecked ? CS_UI.textMuted : CS_UI.text }}>
                      {step.label}
                    </span>
                    {isChecked && (
                      <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px', borderRadius: 9999, background: '#ecfdf5', color: CS_UI.success }}>
                        Complete
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: step.fields.amountKey ? '1fr 1fr 1fr' : '1fr 2fr', gap: 10, marginBottom: 10 }}>
                    <div className="module-form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: '0.75rem', color: CS_UI.textMuted }}>Date</label>
                      <input
                        type="date"
                        value={edit.date}
                        onChange={e => updateEdit(step.key, 'date', e.target.value)}
                        style={{ fontSize: '0.8rem', padding: '6px 8px', border: `1px solid ${CS_UI.border}`, borderRadius: 8 }}
                      />
                    </div>
                    {step.fields.amountKey && (
                      <div className="module-form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '0.75rem', color: CS_UI.textMuted }}>Amount ($)</label>
                        <input
                          type="number"
                          value={edit.amount ?? ''}
                          onChange={e => updateEdit(step.key, 'amount', e.target.value)}
                          placeholder="299"
                          style={{ fontSize: '0.8rem', padding: '6px 8px', border: `1px solid ${CS_UI.border}`, borderRadius: 8 }}
                        />
                      </div>
                    )}
                    <div className="module-form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: '0.75rem', color: CS_UI.textMuted }}>Notes</label>
                      <input
                        type="text"
                        value={edit.notes}
                        onChange={e => updateEdit(step.key, 'notes', e.target.value)}
                        placeholder="Any notes…"
                        style={{ fontSize: '0.8rem', padding: '6px 8px', border: `1px solid ${CS_UI.border}`, borderRadius: 8 }}
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
