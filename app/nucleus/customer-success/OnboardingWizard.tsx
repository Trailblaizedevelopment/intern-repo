'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, Check, Clock, ChevronRight, Upload, Send, FileText,
  User, Mail, Phone, DollarSign, Building2, Loader2,
  AlertTriangle, CheckCircle2, Circle,
} from 'lucide-react';
import { supabase, Chapter } from '@/lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface WizardChapter extends Chapter {
  contract_sent_at?: string | null;
  contract_signed_at?: string | null;
  contract_status?: 'not_sent' | 'sent' | 'signed' | 'declined' | 'voided';
  docusign_envelope_id?: string | null;
  invoice_sent_at?: string | null;
  invoice_paid_at?: string | null;
  invoice_status?: 'not_sent' | 'sent' | 'paid';
  submission_sent_at?: string | null;
  wizard_step?: number;
  wizard_completed_at?: string | null;
}

interface OnboardingWizardProps {
  /** If provided, opens wizard in resume-mode for an existing chapter */
  chapter?: WizardChapter | null;
  onClose: () => void;
  onComplete: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtTs(ts: string | null | undefined): string {
  if (!ts) return '';
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Step indicator
// ─────────────────────────────────────────────────────────────────────────────

const STEPS = [
  { num: 1, label: 'Chapter Info' },
  { num: 2, label: 'Contract' },
  { num: 3, label: 'Invoice' },
  { num: 4, label: 'Submission' },
  { num: 5, label: 'Done' },
];

function StepIndicator({ current, max }: { current: number; max: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, width: '100%' }}>
      {STEPS.map((step, i) => {
        const isComplete = step.num < current;
        const isActive = step.num === current;
        const isLocked = step.num > max;

        return (
          <React.Fragment key={step.num}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 0 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isComplete ? '#1B2A4A' : isActive ? '#C4874A' : isLocked ? '#E5E0D8' : '#D9D4CC',
                color: isComplete || isActive ? '#fff' : isLocked ? '#A09888' : '#6B6058',
                fontSize: '0.8rem', fontWeight: 700,
                border: isActive ? '2px solid #C4874A' : '2px solid transparent',
                transition: 'all 0.2s',
              }}>
                {isComplete ? <Check size={15} /> : step.num}
              </div>
              <span style={{
                fontSize: '0.65rem', marginTop: 4, fontWeight: isActive ? 700 : 400,
                color: isActive ? '#C4874A' : isLocked ? '#A09888' : '#1B2A4A',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 64,
                textAlign: 'center',
              }}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{
                height: 2, flex: 1.5, maxWidth: 48,
                background: step.num < current ? '#1B2A4A' : '#E5E0D8',
                marginBottom: 18, transition: 'background 0.2s',
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Wizard Component
// ─────────────────────────────────────────────────────────────────────────────

export default function OnboardingWizard({ chapter: initialChapter, onClose, onComplete }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(initialChapter?.wizard_step || 1);
  const [maxUnlockedStep, setMaxUnlockedStep] = useState(1);
  const [chapterId, setChapterId] = useState<string | null>(initialChapter?.id || null);
  const [chapterData, setChapterData] = useState<WizardChapter | null>(initialChapter || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 form
  const [form, setForm] = useState({
    chapter_name: initialChapter?.chapter_name || '',
    school: initialChapter?.school || '',
    fraternity: initialChapter?.fraternity || '',
    contact_name: initialChapter?.contact_name || '',
    contact_email: initialChapter?.contact_email || '',
    contact_phone: initialChapter?.contact_phone || '',
    mrr: initialChapter?.mrr || 0,
    payment_type: initialChapter?.payment_type || 'annual' as Chapter['payment_type'],
    payment_amount: initialChapter?.payment_amount || 299,
  });

  // Step 2 — contract
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [recipientName, setRecipientName] = useState(initialChapter?.contact_name || '');
  const [recipientEmail, setRecipientEmail] = useState(initialChapter?.contact_email || '');
  const [sendingContract, setSendingContract] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null) as React.MutableRefObject<HTMLInputElement>;

  // Step 3 — invoice
  const [invoiceSentDate, setInvoiceSentDate] = useState(
    initialChapter?.invoice_sent_at ? initialChapter.invoice_sent_at.split('T')[0] : '',
  );
  const [invoicePaid, setInvoicePaid] = useState(!!initialChapter?.invoice_paid_at);

  // Step 4 — submission
  const [submissionSent, setSubmissionSent] = useState(!!initialChapter?.submission_sent_at);

  // Derived state from chapterData
  const contractSent = !!(chapterData?.contract_sent_at);
  const contractSigned = chapterData?.contract_status === 'signed';
  const invoiceSent = !!(chapterData?.invoice_sent_at);
  const submissionFormSent = !!(chapterData?.submission_sent_at);

  // Compute max unlocked step
  useEffect(() => {
    let max = 1;
    if (chapterId) max = 2;
    if (contractSent) max = 3;
    if (invoiceSent) max = 4;
    if (submissionFormSent) max = 5;
    setMaxUnlockedStep(max);
  }, [chapterId, contractSent, invoiceSent, submissionFormSent]);

  // Re-sync form recipient fields when chapterData updates
  useEffect(() => {
    if (chapterData) {
      setRecipientName(prev => prev || chapterData.contact_name || '');
      setRecipientEmail(prev => prev || chapterData.contact_email || '');
    }
  }, [chapterData]);

  const refreshChapter = useCallback(async (id: string) => {
    if (!supabase) return;
    const { data } = await supabase.from('chapters').select('*').eq('id', id).single();
    if (data) setChapterData(data as WizardChapter);
  }, []);

  // ── Step 1: Create Chapter ──────────────────────────────────────────────────

  async function handleCreateChapter() {
    if (!supabase) return setError('DB not connected');
    if (!form.chapter_name.trim()) return setError('Chapter name is required');
    setSaving(true); setError(null);

    if (chapterId) {
      // Update existing
      const { error: err } = await supabase.from('chapters').update({
        ...form,
        wizard_step: 2,
      }).eq('id', chapterId);
      if (err) { setError(err.message); setSaving(false); return; }
      await refreshChapter(chapterId);
    } else {
      // Create new
      const { data, error: err } = await supabase.from('chapters').insert([{
        ...form,
        status: 'onboarding',
        health: 'good',
        chapter_created: true,
        onboarding_started: new Date().toISOString().split('T')[0],
        wizard_step: 2,
        contract_status: 'not_sent',
        invoice_status: 'not_sent',
      }]).select().single();
      if (err || !data) { setError(err?.message || 'Failed to create chapter'); setSaving(false); return; }
      setChapterId(data.id);
      setChapterData(data as WizardChapter);
    }

    setSaving(false);
    setCurrentStep(2);
  }

  // ── Step 2: Send Contract ───────────────────────────────────────────────────

  async function handleSendContract() {
    if (!chapterId) return setError('No chapter ID');
    if (!pdfFile) return setError('Please upload a PDF first');
    if (!recipientEmail || !recipientName) return setError('Recipient name and email are required');

    setSendingContract(true); setError(null);

    try {
      const pdfBase64 = await fileToBase64(pdfFile);

      const res = await fetch(`/api/chapters/${chapterId}/send-contract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientEmail,
          recipientName,
          pdfBase64,
          pdfFileName: pdfFile.name,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to send contract');
      }

      // Update wizard_step to 3
      if (supabase) {
        await supabase.from('chapters').update({ wizard_step: 3 }).eq('id', chapterId);
      }
      await refreshChapter(chapterId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send contract');
    } finally {
      setSendingContract(false);
    }
  }

  // ── Step 3: Invoice ─────────────────────────────────────────────────────────

  async function handleSaveInvoice() {
    if (!chapterId || !supabase) return;
    if (!invoiceSentDate) return setError('Please select a date when the invoice was sent');
    setSaving(true); setError(null);

    const updates: Record<string, unknown> = {
      invoice_sent_at: new Date(invoiceSentDate).toISOString(),
      invoice_status: invoicePaid ? 'paid' : 'sent',
      wizard_step: 4,
    };
    if (invoicePaid) updates.invoice_paid_at = new Date().toISOString();

    const { error: err } = await supabase.from('chapters').update(updates).eq('id', chapterId);
    if (err) { setError(err.message); setSaving(false); return; }
    await refreshChapter(chapterId);
    setSaving(false);
    setCurrentStep(4);
  }

  // ── Step 4: Submission Form ─────────────────────────────────────────────────

  async function handleSaveSubmission() {
    if (!chapterId || !supabase) return;
    if (!submissionSent) return setError('Please confirm the submission form was sent');
    setSaving(true); setError(null);

    const { error: err } = await supabase.from('chapters').update({
      submission_sent_at: new Date().toISOString(),
      wizard_step: 5,
    }).eq('id', chapterId);
    if (err) { setError(err.message); setSaving(false); return; }
    await refreshChapter(chapterId);
    setSaving(false);
    setCurrentStep(5);
  }

  // ── Step 5: Complete ────────────────────────────────────────────────────────

  async function handleCompleteSetup() {
    if (!chapterId || !supabase) return;
    setSaving(true); setError(null);

    const { error: err } = await supabase.from('chapters').update({
      wizard_completed_at: new Date().toISOString(),
      status: 'onboarding',
      wizard_step: 5,
    }).eq('id', chapterId);

    if (err) { setError(err.message); setSaving(false); return; }
    setSaving(false);
    onComplete();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15, 22, 40, 0.7)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: '#FDFAF5', borderRadius: 20, width: '100%', maxWidth: 640,
          maxHeight: '90vh', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 80px rgba(0,0,0,0.25)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '24px 28px 16px', borderBottom: '1px solid #E5E0D8',
          background: '#1B2A4A', color: '#fff',
          borderRadius: '20px 20px 0 0',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, fontFamily: "'Instrument Serif', Georgia, serif" }}>
                {chapterId ? 'Chapter Onboarding' : 'Add New Chapter'}
              </h2>
              {form.chapter_name && (
                <p style={{ fontSize: '0.85rem', opacity: 0.7, margin: '4px 0 0' }}>{form.chapter_name}</p>
              )}
            </div>
            <button
              onClick={onClose}
              style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer', color: '#fff' }}
            >
              <X size={18} />
            </button>
          </div>
          <StepIndicator current={currentStep} max={maxUnlockedStep} />
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          {error && (
            <div style={{
              background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8,
              padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center',
              color: '#991B1B', fontSize: '0.85rem',
            }}>
              <AlertTriangle size={15} /> {error}
            </div>
          )}

          {/* ── STEP 1 ── */}
          {currentStep === 1 && (
            <Step1ChapterInfo form={form} setForm={setForm} />
          )}

          {/* ── STEP 2 ── */}
          {currentStep === 2 && (
            <Step2Contract
              chapterId={chapterId}
              contractSent={contractSent}
              contractSigned={contractSigned}
              contractSentAt={chapterData?.contract_sent_at}
              contractSignedAt={chapterData?.contract_signed_at}
              contractStatus={chapterData?.contract_status}
              pdfFile={pdfFile}
              setPdfFile={setPdfFile}
              fileInputRef={fileInputRef}
              recipientName={recipientName}
              setRecipientName={setRecipientName}
              recipientEmail={recipientEmail}
              setRecipientEmail={setRecipientEmail}
              onSend={handleSendContract}
              sending={sendingContract}
            />
          )}

          {/* ── STEP 3 ── */}
          {currentStep === 3 && (
            <Step3Invoice
              invoiceSentDate={invoiceSentDate}
              setInvoiceSentDate={setInvoiceSentDate}
              invoicePaid={invoicePaid}
              setInvoicePaid={setInvoicePaid}
              existingInvoiceSentAt={chapterData?.invoice_sent_at}
              existingInvoicePaidAt={chapterData?.invoice_paid_at}
            />
          )}

          {/* ── STEP 4 ── */}
          {currentStep === 4 && (
            <Step4Submission
              submissionSent={submissionSent}
              setSubmissionSent={setSubmissionSent}
              existingSubmissionSentAt={chapterData?.submission_sent_at}
            />
          )}

          {/* ── STEP 5 ── */}
          {currentStep === 5 && (
            <Step5Done chapter={chapterData} />
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 28px', borderTop: '1px solid #E5E0D8',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#F7F5F1',
          borderRadius: '0 0 20px 20px',
        }}>
          <div style={{ fontSize: '0.8rem', color: '#8A7E72' }}>
            Step {currentStep} of 5
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {currentStep > 1 && (
              <button
                onClick={() => setCurrentStep(s => Math.max(1, s - 1))}
                style={{
                  padding: '9px 18px', borderRadius: 8, border: '1px solid #D9D4CC',
                  background: '#fff', cursor: 'pointer', fontSize: '0.875rem', color: '#1B2A4A',
                }}
              >
                Back
              </button>
            )}

            {currentStep === 1 && (
              <button
                onClick={handleCreateChapter}
                disabled={saving || !form.chapter_name.trim()}
                style={primaryBtnStyle(saving || !form.chapter_name.trim())}
              >
                {saving ? <Loader2 size={16} className="spin" /> : null}
                {chapterId ? 'Save & Continue' : 'Create Chapter'}
                <ChevronRight size={16} />
              </button>
            )}

            {currentStep === 2 && (
              <>
                {contractSent ? (
                  <button
                    onClick={() => setCurrentStep(3)}
                    style={primaryBtnStyle(false)}
                  >
                    Continue <ChevronRight size={16} />
                  </button>
                ) : null}
              </>
            )}

            {currentStep === 3 && (
              <button
                onClick={handleSaveInvoice}
                disabled={saving || !invoiceSentDate}
                style={primaryBtnStyle(saving || !invoiceSentDate)}
              >
                {saving ? <Loader2 size={16} /> : null}
                Save & Continue <ChevronRight size={16} />
              </button>
            )}

            {currentStep === 4 && (
              <button
                onClick={handleSaveSubmission}
                disabled={saving || !submissionSent}
                style={primaryBtnStyle(saving || !submissionSent)}
              >
                {saving ? <Loader2 size={16} /> : null}
                Save & Continue <ChevronRight size={16} />
              </button>
            )}

            {currentStep === 5 && (
              <button
                onClick={handleCompleteSetup}
                disabled={saving}
                style={primaryBtnStyle(saving)}
              >
                {saving ? <Loader2 size={16} /> : <CheckCircle2 size={16} />}
                Complete Setup
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step sub-components
// ─────────────────────────────────────────────────────────────────────────────

function Step1ChapterInfo({
  form,
  setForm,
}: {
  form: Record<string, unknown>;
  setForm: React.Dispatch<React.SetStateAction<{
    chapter_name: string; school: string; fraternity: string;
    contact_name: string; contact_email: string; contact_phone: string;
    mrr: number; payment_type: Chapter['payment_type']; payment_amount: number;
  }>>;
}) {
  const fv = form as {
    chapter_name: string; school: string; fraternity: string;
    contact_name: string; contact_email: string; contact_phone: string;
    mrr: number; payment_type: string; payment_amount: number;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionTitle icon={<Building2 size={16} />} title="Chapter Details" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormField label="Chapter Name *">
          <input type="text" value={fv.chapter_name} onChange={e => setForm(f => ({ ...f, chapter_name: e.target.value }))} placeholder="Ole Miss Phi Delt" style={inputStyle} />
        </FormField>
        <FormField label="Fraternity / Org">
          <input type="text" value={fv.fraternity} onChange={e => setForm(f => ({ ...f, fraternity: e.target.value }))} placeholder="Phi Delta Theta" style={inputStyle} />
        </FormField>
      </div>
      <FormField label="School">
        <input type="text" value={fv.school} onChange={e => setForm(f => ({ ...f, school: e.target.value }))} placeholder="University of Mississippi" style={inputStyle} />
      </FormField>

      <SectionTitle icon={<User size={16} />} title="Primary Contact" />
      <FormField label="Contact Name">
        <input type="text" value={fv.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} style={inputStyle} />
      </FormField>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormField label="Contact Email">
          <div style={{ position: 'relative' }}>
            <Mail size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8A7E72' }} />
            <input type="email" value={fv.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} style={{ ...inputStyle, paddingLeft: 30 }} />
          </div>
        </FormField>
        <FormField label="Contact Phone">
          <div style={{ position: 'relative' }}>
            <Phone size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8A7E72' }} />
            <input type="tel" value={fv.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} style={{ ...inputStyle, paddingLeft: 30 }} />
          </div>
        </FormField>
      </div>

      <SectionTitle icon={<DollarSign size={16} />} title="Revenue" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <FormField label="ARR / MRR ($)">
          <input type="number" value={fv.mrr} onChange={e => setForm(f => ({ ...f, mrr: parseFloat(e.target.value) || 0 }))} style={inputStyle} />
        </FormField>
        <FormField label="Payment Type">
          <select value={fv.payment_type} onChange={e => setForm(f => ({ ...f, payment_type: e.target.value as Chapter['payment_type'] }))} style={inputStyle}>
            <option value="annual">Annual</option>
            <option value="monthly">Monthly</option>
            <option value="one_time">One-Time</option>
          </select>
        </FormField>
        <FormField label="Amount ($)">
          <input type="number" value={fv.payment_amount} onChange={e => setForm(f => ({ ...f, payment_amount: parseFloat(e.target.value) || 0 }))} style={inputStyle} />
        </FormField>
      </div>
    </div>
  );
}

function Step2Contract({
  chapterId, contractSent, contractSigned,
  contractSentAt, contractSignedAt, contractStatus,
  pdfFile, setPdfFile, fileInputRef,
  recipientName, setRecipientName, recipientEmail, setRecipientEmail,
  onSend, sending,
}: {
  chapterId: string | null;
  contractSent: boolean;
  contractSigned: boolean;
  contractSentAt?: string | null;
  contractSignedAt?: string | null;
  contractStatus?: string;
  pdfFile: File | null;
  setPdfFile: (f: File | null) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  recipientName: string;
  setRecipientName: (v: string) => void;
  recipientEmail: string;
  setRecipientEmail: (v: string) => void;
  onSend: () => void;
  sending: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionTitle icon={<FileText size={16} />} title="Send Contract via DocuSign" />

      {/* DocuSign status indicators */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <StatusRow
          label="Contract Sent"
          done={contractSent}
          timestamp={contractSentAt}
          pendingText={contractSent ? undefined : 'Not sent yet'}
        />
        <StatusRow
          label="Contract Signed"
          done={contractSigned}
          timestamp={contractSignedAt}
          pendingText={contractSent ? 'Waiting for DocuSign...' : 'Send contract first'}
          isWaiting={contractSent && !contractSigned}
        />
        {contractStatus === 'declined' && (
          <div style={{ padding: '8px 12px', background: '#FEF2F2', borderRadius: 8, color: '#991B1B', fontSize: '0.8rem' }}>
            ❌ Contract was declined
          </div>
        )}
        {contractStatus === 'voided' && (
          <div style={{ padding: '8px 12px', background: '#F3F4F6', borderRadius: 8, color: '#6B7280', fontSize: '0.8rem' }}>
            🚫 Contract was voided
          </div>
        )}
      </div>

      {!contractSent && (
        <>
          <div style={{ marginTop: 8 }}>
            <label style={labelStyle}>PDF Document</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              style={{ display: 'none' }}
              onChange={e => setPdfFile(e.target.files?.[0] || null)}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%', padding: '24px 16px',
                border: '2px dashed #D9D4CC', borderRadius: 10,
                background: '#fff', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                color: pdfFile ? '#1B2A4A' : '#8A7E72',
              }}
            >
              <Upload size={20} />
              <span style={{ fontSize: '0.875rem' }}>
                {pdfFile ? `✓ ${pdfFile.name}` : 'Click to upload PDF'}
              </span>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormField label="Recipient Name">
              <input type="text" value={recipientName} onChange={e => setRecipientName(e.target.value)} style={inputStyle} />
            </FormField>
            <FormField label="Recipient Email">
              <input type="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} style={inputStyle} />
            </FormField>
          </div>

          <button
            onClick={onSend}
            disabled={sending || !pdfFile || !recipientEmail || !recipientName}
            style={primaryBtnStyle(sending || !pdfFile || !recipientEmail || !recipientName)}
          >
            {sending ? <Loader2 size={16} /> : <Send size={16} />}
            {sending ? 'Sending via DocuSign...' : 'Send Contract'}
          </button>

          {!chapterId && (
            <p style={{ fontSize: '0.78rem', color: '#8A7E72', textAlign: 'center' }}>
              Complete Step 1 first to enable sending.
            </p>
          )}
        </>
      )}

      {contractSent && !contractSigned && (
        <div style={{ padding: '12px 16px', background: '#EAF5EA', borderRadius: 8, fontSize: '0.85rem', color: '#2A4229' }}>
          <strong>Contract sent ✅</strong> — {fmtTs(contractSentAt)}<br />
          <span style={{ opacity: 0.8 }}>You can advance to the next step while waiting for the recipient to sign.</span>
        </div>
      )}
    </div>
  );
}

function Step3Invoice({
  invoiceSentDate, setInvoiceSentDate,
  invoicePaid, setInvoicePaid,
  existingInvoiceSentAt, existingInvoicePaidAt,
}: {
  invoiceSentDate: string;
  setInvoiceSentDate: (v: string) => void;
  invoicePaid: boolean;
  setInvoicePaid: (v: boolean) => void;
  existingInvoiceSentAt?: string | null;
  existingInvoicePaidAt?: string | null;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionTitle icon={<DollarSign size={16} />} title="Invoice" />
      <p style={{ fontSize: '0.85rem', color: '#6B6058', margin: 0 }}>
        Track invoice status manually. Stripe automation coming soon.
      </p>

      <StatusRow
        label="Invoice Sent"
        done={!!existingInvoiceSentAt}
        timestamp={existingInvoiceSentAt}
        pendingText="Not sent yet"
      />
      <StatusRow
        label="Invoice Paid"
        done={!!existingInvoicePaidAt || invoicePaid}
        timestamp={existingInvoicePaidAt}
        pendingText="Waiting for payment..."
        isWaiting={!!existingInvoiceSentAt && !existingInvoicePaidAt}
      />

      {!existingInvoiceSentAt && (
        <>
          <FormField label="Date Invoice Was Sent">
            <input
              type="date"
              value={invoiceSentDate}
              onChange={e => setInvoiceSentDate(e.target.value)}
              style={inputStyle}
            />
          </FormField>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: '0.875rem', color: '#1B2A4A' }}>
            <input
              type="checkbox"
              checked={invoicePaid}
              onChange={e => setInvoicePaid(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: '#C4874A' }}
            />
            Invoice already paid
          </label>
        </>
      )}

      <div style={{ padding: '10px 14px', background: '#FEF9EE', borderRadius: 8, fontSize: '0.78rem', color: '#8A6030', border: '1px solid #F5DFA0' }}>
        💡 <strong>Note:</strong> Stripe invoice automation is on the roadmap.
      </div>
    </div>
  );
}

function Step4Submission({
  submissionSent, setSubmissionSent, existingSubmissionSentAt,
}: {
  submissionSent: boolean;
  setSubmissionSent: (v: boolean) => void;
  existingSubmissionSentAt?: string | null;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionTitle icon={<Send size={16} />} title="Submission Form" />
      <p style={{ fontSize: '0.85rem', color: '#6B6058', margin: 0 }}>
        Track whether the onboarding submission form has been sent to the chapter and received.
      </p>

      <StatusRow
        label="Submission Form Sent"
        done={!!existingSubmissionSentAt}
        timestamp={existingSubmissionSentAt}
        pendingText="Not sent yet"
      />
      <StatusRow
        label="Submission Received"
        done={false}
        pendingText="Auto-tracked by existing submission system"
        isWaiting
      />

      {!existingSubmissionSentAt && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: '0.875rem', color: '#1B2A4A', marginTop: 8 }}>
          <input
            type="checkbox"
            checked={submissionSent}
            onChange={e => setSubmissionSent(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: '#C4874A' }}
          />
          I have sent the submission form to the chapter
        </label>
      )}
    </div>
  );
}

function Step5Done({ chapter }: { chapter: WizardChapter | null }) {
  if (!chapter) return null;

  const rows: { label: string; value: string | null; done: boolean }[] = [
    { label: 'Chapter Created', value: fmtTs(chapter.created_at) || 'Yes', done: true },
    { label: 'Contract Sent', value: fmtTs(chapter.contract_sent_at), done: !!chapter.contract_sent_at },
    { label: 'Contract Signed', value: fmtTs(chapter.contract_signed_at), done: chapter.contract_status === 'signed' },
    { label: 'Invoice Sent', value: fmtTs(chapter.invoice_sent_at), done: !!chapter.invoice_sent_at },
    { label: 'Invoice Paid', value: fmtTs(chapter.invoice_paid_at), done: !!chapter.invoice_paid_at },
    { label: 'Submission Form Sent', value: fmtTs(chapter.submission_sent_at), done: !!chapter.submission_sent_at },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🎉</div>
        <h3 style={{ fontSize: '1.2rem', fontFamily: "'Instrument Serif', Georgia, serif", color: '#1B2A4A', margin: 0 }}>
          Setup Complete!
        </h3>
        <p style={{ fontSize: '0.875rem', color: '#6B6058', margin: '6px 0 0' }}>
          {chapter.chapter_name} is ready to go.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(row => (
          <div key={row.label} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 14px', borderRadius: 8,
            background: row.done ? '#EAF5EA' : '#F7F5F1',
            border: `1px solid ${row.done ? '#A7D7A7' : '#E5E0D8'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {row.done
                ? <CheckCircle2 size={16} color="#2A7A2A" />
                : <Circle size={16} color="#A09888" />}
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1B2A4A' }}>{row.label}</span>
            </div>
            <span style={{ fontSize: '0.78rem', color: row.done ? '#2A7A2A' : '#A09888' }}>
              {row.done ? (row.value || '✓') : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared micro-components
// ─────────────────────────────────────────────────────────────────────────────

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <span style={{ color: '#C4874A' }}>{icon}</span>
      <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#1B2A4A' }}>{title}</span>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function StatusRow({
  label, done, timestamp, pendingText, isWaiting,
}: {
  label: string;
  done: boolean;
  timestamp?: string | null;
  pendingText?: string;
  isWaiting?: boolean;
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 14px', borderRadius: 8,
      background: done ? '#EAF5EA' : '#F7F5F1',
      border: `1px solid ${done ? '#A7D7A7' : '#E5E0D8'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {done
          ? <CheckCircle2 size={16} color="#2A7A2A" />
          : isWaiting
            ? <Clock size={16} color="#C4874A" />
            : <Circle size={16} color="#A09888" />}
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1B2A4A' }}>{label}</span>
      </div>
      <span style={{ fontSize: '0.78rem', color: done ? '#2A7A2A' : isWaiting ? '#C4874A' : '#A09888' }}>
        {done ? (timestamp ? fmtTs(timestamp) : '✓') : (isWaiting ? `⏳ ${pendingText || 'Waiting...'}` : pendingText || '—')}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared style helpers
// ─────────────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1px solid #D9D4CC', background: '#fff',
  fontSize: '0.875rem', color: '#1B2A4A', boxSizing: 'border-box',
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.75rem', fontWeight: 600, color: '#6B6058',
  textTransform: 'uppercase', letterSpacing: '0.04em',
};

function primaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center',
    padding: '10px 20px', borderRadius: 8, border: 'none',
    background: disabled ? '#D9D4CC' : '#C4874A',
    color: disabled ? '#8A7E72' : '#fff',
    fontWeight: 700, fontSize: '0.875rem', cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s',
  };
}
