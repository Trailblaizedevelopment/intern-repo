'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Phone, Mail, ChevronRight, Calendar, Edit2, Check, Trash2, Archive, Plus, Clock } from 'lucide-react';

/* ─── Activity Log (standalone, used by activity tab) ─── */
type ActivityType = 'call' | 'text' | 'email' | 'meeting' | 'note';
interface Activity { id: string; type: ActivityType; outcome: string | null; created_at: string; created_by: string | null; }

const ACTIVITY_TYPES: { key: ActivityType; emoji: string; label: string }[] = [
  { key: 'call',    emoji: '📞', label: 'Call'    },
  { key: 'text',    emoji: '💬', label: 'Text'    },
  { key: 'email',   emoji: '📧', label: 'Email'   },
  { key: 'meeting', emoji: '🤝', label: 'Meeting' },
  { key: 'note',    emoji: '📝', label: 'Note'    },
];

function timeAgoActivity(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ActivityLog({ dealId }: { dealId: string }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [actError, setActError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [logType, setLogType] = useState<ActivityType>('call');
  const [logOutcome, setLogOutcome] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/pipeline/deals/${dealId}/activities`);
      if (!res.ok) { setActError('Activity log coming soon — run migration to enable'); return; }
      const data = await res.json();
      setActivities(Array.isArray(data) ? data : []);
    } catch { setActError('Activity log coming soon — run migration to enable'); }
  }, [dealId]);

  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!logOutcome.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/pipeline/deals/${dealId}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: logType, outcome: logOutcome.trim() }),
      });
      if (res.ok) { setLogOutcome(''); setShowForm(false); load(); }
    } catch { /* graceful */ }
    finally { setSaving(false); }
  }

  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Activity Log</span>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 8, background: '#C9A84C', border: 'none', color: '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
        ><Plus size={12} /> Log Activity</button>
      </div>

      {showForm && (
        <div style={{ background: 'var(--ws-bg,#f9fafb)', borderRadius: 10, padding: 12, marginBottom: 12, border: '1px solid var(--ws-border,#e5e7eb)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {ACTIVITY_TYPES.map(at => (
              <button key={at.key} onClick={() => setLogType(at.key)}
                style={{ padding: '5px 10px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 500, border: `1.5px solid ${logType === at.key ? '#C9A84C' : 'var(--ws-border,#e5e7eb)'}`, background: logType === at.key ? '#C9A84C18' : 'var(--ws-surface,#fff)', color: logType === at.key ? '#C9A84C' : 'inherit', cursor: 'pointer' }}>
                {at.emoji} {at.label}
              </button>
            ))}
          </div>
          <textarea value={logOutcome} onChange={e => setLogOutcome(e.target.value)}
            placeholder="What happened? Add notes…" rows={2}
            style={{ width: '100%', padding: '8px 10px', border: '1.5px solid var(--ws-border,#e5e7eb)', borderRadius: 8, fontSize: '0.875rem', resize: 'vertical', background: 'var(--ws-surface,#fff)', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setShowForm(false); setLogOutcome(''); }}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--ws-border,#e5e7eb)', background: 'none', cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
            <button onClick={submit} disabled={saving || !logOutcome.trim()}
              style={{ padding: '6px 14px', borderRadius: 8, background: '#C9A84C', border: 'none', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', opacity: logOutcome.trim() ? 1 : 0.5 }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {actError ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--ws-text-secondary,#9ca3af)' }}>{actError}</div>
      ) : activities.length === 0 ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--ws-text-secondary,#9ca3af)' }}>No activity logged yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {activities.map(act => {
            const typeInfo = ACTIVITY_TYPES.find(t => t.key === act.type);
            return (
              <div key={act.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 8, background: 'var(--ws-bg,#f9fafb)', border: '1px solid var(--ws-border,#e5e7eb)' }}>
                <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{typeInfo?.emoji || '📝'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.875rem' }}>{act.outcome || '—'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ws-text-secondary,#9ca3af)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={11} /> {timeAgoActivity(act.created_at)}
                    {act.created_by && <span>· {act.created_by}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
import { Deal, DealStage, STAGE_CONFIG } from '@/lib/supabase';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import ModalOverlay from '@/components/ModalOverlay';
import FollowUpPicker from './FollowUpPicker';

const STAGE_ORDER: DealStage[] = ['lead', 'demo_booked', 'first_demo', 'second_call', 'contract_sent', 'closed_won'];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function formatDate(date: string): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface LeadDetailPanelProps {
  deal: Deal;
  onClose: () => void;
  onUpdated: () => void;
  onDelete: (id: string) => void;
}

export default function LeadDetailPanel({ deal, onClose, onUpdated, onDelete }: LeadDetailPanelProps) {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'details' | 'notes' | 'activity'>('details');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [savedField, setSavedField] = useState<string | null>(null);
  const [notes, setNotes] = useState(deal.notes || '');
  const [notesSaved, setNotesSaved] = useState(false);
  const [showFollowUpPicker, setShowFollowUpPicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  // Update notes when deal changes
  useEffect(() => {
    setNotes(deal.notes || '');
  }, [deal.notes]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const closePanel = useCallback(() => {
    setIsVisible(false);
    setTimeout(onClose, 250);
  }, [onClose]);

  // ---- INLINE FIELD EDITING ----
  function startEditing(field: string, currentValue: string) {
    setEditingField(field);
    setEditValue(currentValue);
  }

  async function saveField(field: string) {
    if (!supabase || saving) return;
    setSaving(true);

    let val: string | number | null = editValue.trim() || null;
    if (field === 'value') val = parseFloat(editValue) || 0;

    const { error } = await supabase
      .from('deals')
      .update({ [field]: val })
      .eq('id', deal.id);

    setSaving(false);
    setEditingField(null);

    if (error) {
      showToast('Failed to save. Please try again.', 'error');
    } else {
      setSavedField(field);
      setTimeout(() => setSavedField(null), 1200);
      showToast('Saved', 'success');
      onUpdated();
    }
  }

  // ---- STAGE CHANGE ----
  async function changeStage(newStage: DealStage) {
    if (!supabase) return;
    const { error } = await supabase
      .from('deals')
      .update({ stage: newStage })
      .eq('id', deal.id);

    if (error) {
      showToast('Failed to update stage. Please try again.', 'error');
    } else {
      showToast(`Stage updated to ${STAGE_CONFIG[newStage]?.label}`, 'success');
      onUpdated();
    }
  }

  // ---- ADVANCE STAGE ----
  function advanceStage() {
    const idx = STAGE_ORDER.indexOf(deal.stage);
    if (idx === -1 || idx >= STAGE_ORDER.length - 1) return;
    changeStage(STAGE_ORDER[idx + 1]);
  }

  // ---- FOLLOW-UP ----
  async function setFollowUp(date: string | null) {
    if (!supabase) return;
    const { error } = await supabase
      .from('deals')
      .update({ next_followup: date })
      .eq('id', deal.id);

    setShowFollowUpPicker(false);
    if (error) {
      showToast('Failed to save. Please try again.', 'error');
    } else {
      showToast(date ? `Follow-up set for ${formatDate(date)}` : 'Follow-up cleared', date ? 'success' : 'info');
      onUpdated();
    }
  }

  // ---- NOTES AUTO-SAVE ----
  function handleNotesChange(val: string) {
    setNotes(val);
    setNotesSaved(false);
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(() => saveNotes(val), 2000);
  }

  async function saveNotes(val: string) {
    if (!supabase) return;
    const { error } = await supabase
      .from('deals')
      .update({ notes: val || null })
      .eq('id', deal.id);

    if (!error) {
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    }
  }

  // Save notes on blur
  function handleNotesBlur() {
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    saveNotes(notes);
  }

  // ---- CALL ----
  function handleCall() {
    if (!deal.phone) {
      showToast('No phone number set for this lead', 'info');
      return;
    }
    if (isMobile) {
      window.location.href = `tel:${deal.phone}`;
    } else {
      navigator.clipboard.writeText(deal.phone).then(() => {
        showToast(`Copied: ${deal.phone}`, 'info');
      });
    }
  }

  // ---- EMAIL ----
  function handleEmail() {
    if (deal.email) {
      window.location.href = `mailto:${deal.email}`;
    }
  }

  // ---- ARCHIVE ----
  async function archiveLead() {
    if (!supabase) return;
    const { error } = await supabase
      .from('deals')
      .update({ stage: 'hold_off' as DealStage })
      .eq('id', deal.id);

    setShowArchiveConfirm(false);
    if (error) {
      showToast('Failed to archive. Please try again.', 'error');
    } else {
      showToast('Lead archived', 'success');
      onUpdated();
      closePanel();
    }
  }

  // ---- DRAG TO DISMISS (mobile) ----
  function onDragStart(e: React.TouchEvent) {
    dragStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  }
  function onDragMove(e: React.TouchEvent) {
    if (!isDragging) return;
    const diff = e.touches[0].clientY - dragStartY.current;
    if (diff > 0) setDragY(diff);
  }
  function onDragEnd() {
    setIsDragging(false);
    if (dragY > 120) {
      closePanel();
    }
    setDragY(0);
  }

  // ---- RENDER HELPERS ----
  function renderField(label: string, field: string, value: string, opts?: { type?: string; clickable?: string }) {
    const isEditing = editingField === field;
    const isSaved = savedField === field;

    return (
      <div className="ldp-field" key={field}>
        <span className="ldp-field-label">{label}</span>
        {isEditing ? (
          <div className="ldp-field-edit">
            <input
              type={opts?.type || 'text'}
              className="ldp-field-input"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveField(field); if (e.key === 'Escape') setEditingField(null); }}
              onBlur={() => saveField(field)}
              autoFocus
              inputMode={opts?.type === 'number' ? 'numeric' : opts?.type === 'tel' ? 'tel' : opts?.type === 'email' ? 'email' : undefined}
            />
          </div>
        ) : (
          <span
            className={`ldp-field-value ${opts?.clickable ? 'ldp-field-clickable' : ''} ${isSaved ? 'ldp-field-saved' : ''}`}
            onClick={() => {
              if (opts?.clickable === 'tel' && value) { handleCall(); }
              else if (opts?.clickable === 'mailto' && value) { handleEmail(); }
              else { startEditing(field, value || ''); }
            }}
          >
            {value || '—'}
            {isSaved ? <Check size={14} className="ldp-field-check" /> : <Edit2 size={12} className="ldp-field-pencil" />}
          </span>
        )}
      </div>
    );
  }

  const stageColor = STAGE_CONFIG[deal.stage]?.color || '#6b7280';
  const canAdvance = STAGE_ORDER.indexOf(deal.stage) >= 0 && STAGE_ORDER.indexOf(deal.stage) < STAGE_ORDER.length - 1;

  return (
    <>
      {/* Overlay */}
      <div
        className={`ldp-overlay ${isVisible ? 'ldp-overlay-visible' : ''}`}
        onClick={closePanel}
      />

      {/* Panel / Sheet */}
      <div
        ref={panelRef}
        className={`ldp-panel ${isMobile ? 'ldp-panel-mobile' : 'ldp-panel-desktop'} ${isVisible ? 'ldp-panel-visible' : ''}`}
        style={isMobile && dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
      >
        {/* Drag handle (mobile only) */}
        {isMobile && (
          <div
            className="ldp-drag-handle"
            onTouchStart={onDragStart}
            onTouchMove={onDragMove}
            onTouchEnd={onDragEnd}
          >
            <div className="ldp-drag-bar" />
          </div>
        )}

        {/* Close button */}
        <button className="ldp-close" onClick={closePanel} aria-label="Close">
          <X size={20} />
        </button>

        {/* Header */}
        <div className="ldp-header">
          <div className="ldp-header-top">
            <h2 className="ldp-name">{deal.contact_name || deal.name}</h2>
            <span className="ldp-value">{formatCurrency(deal.value)}</span>
          </div>
          <div className="ldp-header-meta">
            {deal.organization && <span>{deal.organization}</span>}
            {deal.organization && deal.fraternity && <span className="ldp-meta-dot">·</span>}
            {deal.fraternity && <span>{deal.fraternity}</span>}
            <span className="ldp-stage-badge" style={{ backgroundColor: `${stageColor}18`, color: stageColor }}>
              {STAGE_CONFIG[deal.stage]?.emoji} {STAGE_CONFIG[deal.stage]?.label}
            </span>
          </div>
        </div>

        {/* Quick Action Bar */}
        <div className="ldp-actions">
          <button className="ldp-action-btn" onClick={handleCall} disabled={!deal.phone}>
            <Phone size={18} />
            {!isMobile && <span>Call</span>}
          </button>
          <button className="ldp-action-btn" onClick={handleEmail} disabled={!deal.email}>
            <Mail size={18} />
            {!isMobile && <span>Email</span>}
          </button>
          <button className="ldp-action-btn ldp-action-primary" onClick={advanceStage} disabled={!canAdvance}>
            <ChevronRight size={18} />
            {!isMobile && <span>{canAdvance ? 'Next Stage' : 'Won'}</span>}
          </button>
          <button className="ldp-action-btn" onClick={() => setShowFollowUpPicker(true)}>
            <Calendar size={18} />
            {!isMobile && <span>Follow-up</span>}
          </button>
        </div>

        {/* Follow-up Picker */}
        {showFollowUpPicker && (
          <FollowUpPicker
            currentDate={deal.next_followup}
            onSelect={setFollowUp}
            onClose={() => setShowFollowUpPicker(false)}
            isMobile={isMobile}
          />
        )}

        {/* Tabs */}
        <div className="ldp-tabs">
          {(['details', 'notes', 'activity'] as const).map(tab => (
            <button
              key={tab}
              className={`ldp-tab ${activeTab === tab ? 'ldp-tab-active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="ldp-body">
          {activeTab === 'details' && (
            <div className="ldp-details">
              {/* Stage dropdown */}
              <div className="ldp-field">
                <span className="ldp-field-label">Stage</span>
                <select
                  className="ldp-stage-select"
                  value={deal.stage}
                  onChange={e => changeStage(e.target.value as DealStage)}
                  style={{ color: stageColor }}
                >
                  {Object.entries(STAGE_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key}>{cfg.emoji} {cfg.label}</option>
                  ))}
                </select>
              </div>

              {renderField('Organization', 'organization', deal.organization || '')}
              {renderField('Fraternity', 'fraternity', deal.fraternity || '')}
              {renderField('Contact Name', 'contact_name', deal.contact_name || '')}
              {renderField('Email', 'email', deal.email || '', { type: 'email', clickable: 'mailto' })}
              {renderField('Phone', 'phone', deal.phone || '', { type: 'tel', clickable: 'tel' })}
              {renderField('Pipeline Value', 'value', String(deal.value || 0), { type: 'number' })}

              {/* Follow-up */}
              <div className="ldp-field">
                <span className="ldp-field-label">Follow-up Date</span>
                <span
                  className="ldp-field-value ldp-field-clickable"
                  onClick={() => setShowFollowUpPicker(true)}
                >
                  {deal.next_followup ? formatDate(deal.next_followup) : '—'}
                  <Edit2 size={12} className="ldp-field-pencil" />
                </span>
              </div>

              {renderField('Expected Close', 'expected_close', deal.expected_close || '', { type: 'date' })}

              <div className="ldp-field">
                <span className="ldp-field-label">Date Added</span>
                <span className="ldp-field-value ldp-field-readonly">{formatDate(deal.created_at)}</span>
              </div>
            </div>
          )}

          {activeTab === 'notes' && (
            <div className="ldp-notes">
              <textarea
                className="ldp-notes-textarea"
                value={notes}
                onChange={e => handleNotesChange(e.target.value)}
                onBlur={handleNotesBlur}
                placeholder="Add notes about this lead..."
                rows={10}
              />
              {notesSaved && <span className="ldp-notes-saved">Saved</span>}
            </div>
          )}

          {activeTab === 'activity' && (
            <ActivityLog dealId={deal.id} />
          )}
        </div>

        {/* Footer */}
        <div className="ldp-footer">
          <button className="ldp-footer-btn ldp-archive-btn" onClick={() => setShowArchiveConfirm(true)}>
            <Archive size={16} />
            Archive Lead
          </button>
          <button className="ldp-footer-btn ldp-delete-btn" onClick={() => setShowDeleteConfirm(true)}>
            <Trash2 size={16} />
            Delete Lead
          </button>
        </div>

        {/* Confirm modals */}
        {showArchiveConfirm && (
          <ModalOverlay className="ldp-confirm-overlay" onClose={() => setShowArchiveConfirm(false)}>
            <div className="ldp-confirm" onClick={e => e.stopPropagation()}>
              <h3>Archive this lead?</h3>
              <p>This will move the lead to &quot;Hold Off&quot; status. You can reactivate it later.</p>
              <div className="ldp-confirm-actions">
                <button className="ldp-confirm-cancel" onClick={() => setShowArchiveConfirm(false)}>Cancel</button>
                <button className="ldp-confirm-ok" onClick={archiveLead}>Archive</button>
              </div>
            </div>
          </ModalOverlay>
        )}
        {showDeleteConfirm && (
          <ModalOverlay className="ldp-confirm-overlay" onClose={() => setShowDeleteConfirm(false)}>
            <div className="ldp-confirm" onClick={e => e.stopPropagation()}>
              <h3>Delete this lead?</h3>
              <p>This action cannot be undone. All data for this lead will be permanently removed.</p>
              <div className="ldp-confirm-actions">
                <button className="ldp-confirm-cancel" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
                <button className="ldp-confirm-ok ldp-confirm-danger" onClick={() => { onDelete(deal.id); closePanel(); }}>Delete</button>
              </div>
            </div>
          </ModalOverlay>
        )}
      </div>
    </>
  );
}
