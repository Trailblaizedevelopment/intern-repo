'use client';

import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Star,
  Plus,
  Search,
  X,
  Trash2,
  Edit2,
  LayoutDashboard,
  Mail,
  Phone,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ClipboardList,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { Ambassador, AmbassadorStatus } from '@/lib/supabase';
import ConfirmModal from '@/components/ConfirmModal';
import ModalOverlay from '@/components/ModalOverlay';
import { SkeletonTable } from '@/components/Skeleton';

const STATUS_CONFIG: Record<AmbassadorStatus, { label: string; color: string; bg: string }> = {
  active:   { label: 'Active',      color: '#10b981', bg: '#d1fae5' },
  inactive: { label: 'Inactive',    color: '#6b7280', bg: '#f3f4f6' },
  prospect: { label: 'Prospect',    color: '#f59e0b', bg: '#fef3c7' },
  pending:  { label: 'Pending',     color: '#3b82f6', bg: '#dbeafe' },
};

function isEmail(value: string) {
  return value.includes('@');
}

type TabType = 'ambassadors' | 'applications';

interface AmbassadorApplication {
  name: string;
  phone: string;
  email: string;
  school?: string;
  instagram?: string;
  why?: string;
  submitted_at: string;
  type: 'ambassador';
}

export default function AmbassadorsModule() {
  const [activeTab, setActiveTab] = useState<TabType>('ambassadors');
  const [ambassadors, setAmbassadors] = useState<Ambassador[]>([]);
  const [applications, setApplications] = useState<AmbassadorApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AmbassadorStatus>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingAmbassador, setEditingAmbassador] = useState<Ambassador | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: string | null }>({ show: false, id: null });
  const [saving, setSaving] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approvedCredentials, setApprovedCredentials] = useState<{ name: string; email: string; password: string } | null>(null);
  const [credentialsCopied, setCredentialsCopied] = useState(false);

  const DEFAULT_AMBASSADOR_PASSWORD = 'Trailblaize2026!';
  const [formData, setFormData] = useState({
    name: '',
    school: '',
    contact: '',
    status: 'prospect' as AmbassadorStatus,
    notes: '',
  });

  useEffect(() => {
    fetchAmbassadors();
    loadApplications();
  }, []);

  function loadApplications() {
    try {
      const stored = localStorage.getItem('tb_ambassador_applications');
      if (stored) {
        setApplications(JSON.parse(stored));
      }
    } catch (_e) {
      // ignore
    }
  }

  async function fetchAmbassadors() {
    setLoading(true);
    try {
      const res = await fetch('/api/ambassadors');
      const result = await res.json();
      if (result.error) {
        console.error('Error fetching ambassadors:', result.error);
      } else {
        setAmbassadors(result.data || []);
      }
    } catch (err) {
      console.error('Error fetching ambassadors:', err);
    }
    setLoading(false);
  }

  async function approveAmbassador(id: string) {
    setApprovingId(id);
    try {
      // Find the ambassador record to get their info
      const amb = ambassadors.find((a) => a.id === id);

      // 1. Mark as active
      const res = await fetch(`/api/ambassadors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      });
      const result = await res.json();
      if (result.error) {
        console.error('Error approving ambassador:', result.error);
        setApprovingId(null);
        return;
      }

      // 2. Create employee login account
      if (amb && amb.contact) {
        let extra: Record<string, string> = {};
        try { extra = JSON.parse(amb.notes || '{}'); } catch (_e) {}
        const phone = extra.phone || '';
        const instagram = extra.instagram || '';

        await fetch('/api/employees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: amb.contact,
            password: DEFAULT_AMBASSADOR_PASSWORD,
            name: amb.name,
            role: 'ambassador',
            seniority: 1,
            department: amb.school || '',
            status: 'active',
            start_date: new Date().toISOString().split('T')[0],
          }),
        });

        setApprovedCredentials({
          name: amb.name,
          email: amb.contact,
          password: DEFAULT_AMBASSADOR_PASSWORD,
        });
      }

      fetchAmbassadors();
    } catch (err) {
      console.error('Error approving:', err);
    }
    setApprovingId(null);
  }

  async function denyAmbassador(id: string) {
    setApprovingId(id);
    try {
      const res = await fetch(`/api/ambassadors/${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (!result.error) {
        fetchAmbassadors();
      }
    } catch (err) {
      console.error('Error denying:', err);
    }
    setApprovingId(null);
  }

  async function approveLocalApplication(app: AmbassadorApplication, index: number) {
    // Create ambassador from the local application
    setSaving(true);
    try {
      const res = await fetch('/api/ambassadors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: app.name,
          school: app.school || '',
          contact: app.email,
          status: 'active',
          notes: JSON.stringify({
            phone: app.phone || '',
            instagram: app.instagram || '',
            why: app.why || '',
          }),
        }),
      });
      const result = await res.json();
      if (!result.error) {
        // Remove from local applications
        const updated = applications.filter((_, i) => i !== index);
        setApplications(updated);
        try {
          localStorage.setItem('tb_ambassador_applications', JSON.stringify(updated));
        } catch (_e) {}

        // Create employee login account
        await fetch('/api/employees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: app.email,
            password: DEFAULT_AMBASSADOR_PASSWORD,
            name: app.name,
            role: 'ambassador',
            seniority: 1,
            department: app.school || '',
            status: 'active',
            start_date: new Date().toISOString().split('T')[0],
          }),
        });

        setApprovedCredentials({
          name: app.name,
          email: app.email,
          password: DEFAULT_AMBASSADOR_PASSWORD,
        });

        fetchAmbassadors();
      }
    } catch (err) {
      console.error('Error approving local application:', err);
    }
    setSaving(false);
  }

  function denyLocalApplication(index: number) {
    const updated = applications.filter((_, i) => i !== index);
    setApplications(updated);
    try {
      localStorage.setItem('tb_ambassador_applications', JSON.stringify(updated));
    } catch (_e) {}
  }

  async function saveAmbassador() {
    if (!formData.name || !formData.school) return;
    setSaving(true);
    try {
      const url = editingAmbassador
        ? `/api/ambassadors/${editingAmbassador.id}`
        : '/api/ambassadors';
      const method = editingAmbassador ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const result = await res.json();

      if (result.error) {
        console.error('Error saving ambassador:', result.error);
        alert(`Failed to save: ${result.error.message}`);
      } else {
        resetForm();
        fetchAmbassadors();
      }
    } catch (err) {
      console.error('Error saving ambassador:', err);
      alert('Failed to save ambassador. Please try again.');
    }
    setSaving(false);
  }

  async function deleteAmbassador(id: string) {
    try {
      const res = await fetch(`/api/ambassadors/${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.error) {
        console.error('Error deleting ambassador:', result.error);
        alert('Failed to delete ambassador');
      } else {
        fetchAmbassadors();
      }
    } catch (err) {
      console.error('Error deleting ambassador:', err);
    }
    setDeleteConfirm({ show: false, id: null });
  }

  function openEditModal(ambassador: Ambassador) {
    setEditingAmbassador(ambassador);
    setFormData({
      name: ambassador.name,
      school: ambassador.school,
      contact: ambassador.contact,
      status: ambassador.status,
      notes: ambassador.notes || '',
    });
    setShowModal(true);
  }

  function resetForm() {
    setFormData({ name: '', school: '', contact: '', status: 'prospect', notes: '' });
    setEditingAmbassador(null);
    setShowModal(false);
    setSaving(false);
  }

  // Separate pending from active/prospect/inactive for the main table
  const pendingAmbassadors = ambassadors.filter((a) => a.status === 'pending');
  const activeAmbassadors = ambassadors.filter((a) => a.status !== 'pending');

  const filtered = activeAmbassadors.filter((a) => {
    const matchesSearch =
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.school.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.contact && a.contact.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const total = activeAmbassadors.length;
  const active = activeAmbassadors.filter((a) => a.status === 'active').length;
  const prospects = activeAmbassadors.filter((a) => a.status === 'prospect').length;
  const uniqueSchools = new Set(activeAmbassadors.map((a) => a.school)).size;
  const totalApplications = applications.length + pendingAmbassadors.length;

  const tabStyle = (tab: TabType): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 16px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    fontWeight: 600,
    background: activeTab === tab ? '#0F172A' : 'transparent',
    color: activeTab === tab ? 'white' : '#6B7280',
    transition: 'all 0.15s ease',
  });

  return (
    <div className="module-page">
      {/* Header */}
      <header className="module-header">
        <div className="module-header-content">
          <div className="module-back-links">
            <Link href="/nucleus" className="module-back">
              <ArrowLeft size={20} />
              Back to Nucleus
            </Link>
            <Link href="/workspace" className="module-back">
              <LayoutDashboard size={20} />
              Back to Workspace
            </Link>
          </div>
          <div className="module-title-row">
            <div className="module-icon" style={{ backgroundColor: '#fbbf2415', color: '#f59e0b' }}>
              <Star size={24} />
            </div>
            <div>
              <h1>Ambassador Tracker</h1>
              <p>Track student ambassadors by school — name, contact, status, and notes.</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="module-main">
        {/* Stats Row */}
        <div className="module-stats-row">
          <div className="module-stat">
            <span className="module-stat-value">{total}</span>
            <span className="module-stat-label">Total Ambassadors</span>
          </div>
          <div className="module-stat">
            <span className="module-stat-value" style={{ color: '#10b981' }}>{active}</span>
            <span className="module-stat-label">Active</span>
          </div>
          <div className="module-stat">
            <span className="module-stat-value" style={{ color: '#f59e0b' }}>{prospects}</span>
            <span className="module-stat-label">Prospects</span>
          </div>
          <div className="module-stat">
            <span className="module-stat-value">{uniqueSchools}</span>
            <span className="module-stat-label">Schools Covered</span>
          </div>
          <div className="module-stat">
            <span className="module-stat-value" style={{ color: '#3b82f6' }}>{totalApplications}</span>
            <span className="module-stat-label">Pending Applications</span>
          </div>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '4px',
            padding: '4px',
            background: '#F3F4F6',
            borderRadius: '10px',
            width: 'fit-content',
            marginBottom: '20px',
          }}
        >
          <button style={tabStyle('ambassadors')} onClick={() => setActiveTab('ambassadors')}>
            <Users size={15} />
            Ambassadors
          </button>
          <button style={tabStyle('applications')} onClick={() => setActiveTab('applications')}>
            <ClipboardList size={15} />
            Applications
            {totalApplications > 0 && (
              <span
                style={{
                  background: '#3b82f6',
                  color: 'white',
                  borderRadius: '10px',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '1px 7px',
                  marginLeft: '2px',
                }}
              >
                {totalApplications}
              </span>
            )}
          </button>
        </div>

        {/* ─── AMBASSADORS TAB ─── */}
        {activeTab === 'ambassadors' && (
          <>
            {/* Actions Bar */}
            <div className="module-actions-bar">
              <div className="module-search">
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Search ambassadors..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="module-actions">
                <select
                  className="applications-filter-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | AmbassadorStatus)}
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="prospect">Prospect</option>
                  <option value="inactive">Inactive</option>
                </select>
                <button className="module-filter-btn" onClick={fetchAmbassadors}>
                  <RefreshCw size={16} />
                  Refresh
                </button>
                <button className="module-primary-btn" onClick={() => setShowModal(true)}>
                  <Plus size={18} />
                  Add Ambassador
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="module-table-container">
              {loading ? (
                <SkeletonTable rows={5} cols={5} />
              ) : filtered.length > 0 ? (
                <table className="module-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>School</th>
                      <th>Contact</th>
                      <th>Status</th>
                      <th>Notes</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((ambassador) => (
                      <tr key={ambassador.id}>
                        <td className="module-table-name">{ambassador.name}</td>
                        <td>{ambassador.school}</td>
                        <td>
                          {ambassador.contact ? (
                            isEmail(ambassador.contact) ? (
                              <a
                                href={`mailto:${ambassador.contact}`}
                                className="contact-item"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#3b82f6', fontSize: '0.875rem' }}
                              >
                                <Mail size={13} />
                                {ambassador.contact}
                              </a>
                            ) : (
                              <a
                                href={`tel:${ambassador.contact}`}
                                className="contact-item"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#3b82f6', fontSize: '0.875rem' }}
                              >
                                <Phone size={13} />
                                {ambassador.contact}
                              </a>
                            )
                          ) : (
                            <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>—</span>
                          )}
                        </td>
                        <td>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 10px',
                              borderRadius: '9999px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              color: STATUS_CONFIG[ambassador.status].color,
                              backgroundColor: STATUS_CONFIG[ambassador.status].bg,
                            }}
                          >
                            {STATUS_CONFIG[ambassador.status].label}
                          </span>
                        </td>
                        <td style={{ maxWidth: '260px' }}>
                          <span
                            style={{
                              display: 'block',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontSize: '0.8125rem',
                              color: '#6b7280',
                            }}
                            title={ambassador.notes || ''}
                          >
                            {ambassador.notes || '—'}
                          </span>
                        </td>
                        <td>
                          <div className="module-table-actions">
                            <button
                              className="module-table-action"
                              title="Edit"
                              onClick={() => openEditModal(ambassador)}
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              className="module-table-action delete"
                              title="Delete"
                              onClick={() => setDeleteConfirm({ show: true, id: ambassador.id })}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="module-empty-state">
                  <Star size={48} />
                  <h3>{searchQuery || statusFilter !== 'all' ? 'No ambassadors match your filters' : 'No ambassadors yet'}</h3>
                  <p>
                    {searchQuery || statusFilter !== 'all'
                      ? 'Try adjusting your search or filters.'
                      : 'Add your first student ambassador or check the Applications tab for incoming requests.'}
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ─── APPLICATIONS TAB ─── */}
        {activeTab === 'applications' && (
          <div>
            {totalApplications === 0 ? (
              <div className="module-empty-state">
                <ClipboardList size={48} />
                <h3>No pending applications</h3>
                <p>
                  Applications submitted via{' '}
                  <a href="/join/ambassador" target="_blank" rel="noopener noreferrer" style={{ color: '#10b981', fontWeight: 600 }}>
                    /join/ambassador
                  </a>{' '}
                  will appear here.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                {/* DB pending ambassadors */}
                {pendingAmbassadors.map((amb) => {
                  let extra: Record<string, string> = {};
                  try { extra = JSON.parse(amb.notes || '{}'); } catch (_e) {}
                  return (
                    <div
                      key={amb.id}
                      style={{
                        background: 'white',
                        border: '1px solid #E5E7EB',
                        borderRadius: '12px',
                        padding: '20px 24px',
                        display: 'flex',
                        gap: '16px',
                        alignItems: 'flex-start',
                      }}
                    >
                      <div
                        style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '10px',
                          background: '#DBEAFE',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          fontSize: '18px',
                        }}
                      >
                        🌟
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111827' }}>{amb.name}</span>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              color: '#3b82f6',
                              background: '#DBEAFE',
                              borderRadius: '6px',
                              padding: '2px 8px',
                            }}
                          >
                            New
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '0.8125rem', color: '#6B7280' }}>
                          {amb.school && <span>🏫 {amb.school}</span>}
                          {amb.contact && <span>✉️ {amb.contact}</span>}
                          {extra.phone && <span>📱 {extra.phone}</span>}
                          {extra.instagram && <span>📸 {extra.instagram}</span>}
                        </div>
                        {extra.why && (
                          <p
                            style={{
                              fontSize: '0.8125rem',
                              color: '#374151',
                              margin: '8px 0 0',
                              lineHeight: 1.55,
                              background: '#F9FAFB',
                              border: '1px solid #E5E7EB',
                              borderRadius: '8px',
                              padding: '8px 12px',
                            }}
                          >
                            &ldquo;{extra.why}&rdquo;
                          </p>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        <button
                          onClick={() => approveAmbassador(amb.id)}
                          disabled={approvingId === amb.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '8px 14px',
                            background: '#10B981', color: 'white',
                            border: 'none', borderRadius: '8px',
                            fontSize: '0.8125rem', fontWeight: 600,
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}
                        >
                          <CheckCircle2 size={14} />
                          Approve
                        </button>
                        <button
                          onClick={() => denyAmbassador(amb.id)}
                          disabled={approvingId === amb.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '8px 14px',
                            background: 'white', color: '#EF4444',
                            border: '1px solid #FCA5A5', borderRadius: '8px',
                            fontSize: '0.8125rem', fontWeight: 600,
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}
                        >
                          <XCircle size={14} />
                          Deny
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Local storage applications */}
                {applications.map((app, index) => (
                  <div
                    key={`local-${index}`}
                    style={{
                      background: 'white',
                      border: '1px solid #E5E7EB',
                      borderRadius: '12px',
                      padding: '20px 24px',
                      display: 'flex',
                      gap: '16px',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '10px',
                        background: '#DBEAFE',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        fontSize: '18px',
                      }}
                    >
                      🌟
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111827' }}>{app.name}</span>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            color: '#9CA3AF',
                            background: '#F3F4F6',
                            borderRadius: '6px',
                            padding: '2px 8px',
                          }}
                        >
                          Local
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '0.8125rem', color: '#6B7280' }}>
                        {app.school && <span>🏫 {app.school}</span>}
                        <span>✉️ {app.email}</span>
                        <span>📱 {app.phone}</span>
                        {app.instagram && <span>📸 {app.instagram}</span>}
                      </div>
                      {app.why && (
                        <p
                          style={{
                            fontSize: '0.8125rem',
                            color: '#374151',
                            margin: '8px 0 0',
                            lineHeight: 1.55,
                            background: '#F9FAFB',
                            border: '1px solid #E5E7EB',
                            borderRadius: '8px',
                            padding: '8px 12px',
                          }}
                        >
                          &ldquo;{app.why}&rdquo;
                        </p>
                      )}
                      <p style={{ fontSize: '0.75rem', color: '#9CA3AF', margin: '6px 0 0' }}>
                        Submitted {new Date(app.submitted_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      <button
                        onClick={() => approveLocalApplication(app, index)}
                        disabled={saving}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          padding: '8px 14px',
                          background: '#10B981', color: 'white',
                          border: 'none', borderRadius: '8px',
                          fontSize: '0.8125rem', fontWeight: 600,
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        <CheckCircle2 size={14} />
                        Approve
                      </button>
                      <button
                        onClick={() => denyLocalApplication(index)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          padding: '8px 14px',
                          background: 'white', color: '#EF4444',
                          border: '1px solid #FCA5A5', borderRadius: '8px',
                          fontSize: '0.8125rem', fontWeight: 600,
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        <XCircle size={14} />
                        Deny
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Add/Edit Modal */}
      {showModal && (
        <ModalOverlay className="module-modal-overlay" onClose={resetForm}>
          <div className="module-modal" onClick={(e) => e.stopPropagation()}>
            <div className="module-modal-header">
              <h2>{editingAmbassador ? 'Edit Ambassador' : 'Add Ambassador'}</h2>
              <button className="module-modal-close" onClick={resetForm}>
                <X size={20} />
              </button>
            </div>
            <div className="module-modal-body">
              <div className="module-form-row">
                <div className="module-form-group">
                  <label>Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Full name"
                  />
                </div>
                <div className="module-form-group">
                  <label>School *</label>
                  <input
                    type="text"
                    value={formData.school}
                    onChange={(e) => setFormData({ ...formData, school: e.target.value })}
                    placeholder="e.g. University of Texas"
                  />
                </div>
              </div>
              <div className="module-form-row">
                <div className="module-form-group">
                  <label>Contact</label>
                  <input
                    type="text"
                    value={formData.contact}
                    onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                    placeholder="Email or phone number"
                  />
                </div>
                <div className="module-form-group">
                  <label>Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value as AmbassadorStatus })
                    }
                  >
                    <option value="prospect">Prospect</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="module-form-group">
                <label>Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Any relevant context, how they were found, what they're doing..."
                  rows={3}
                  style={{ resize: 'vertical' }}
                />
              </div>
            </div>
            <div className="module-modal-footer">
              <button className="module-cancel-btn" onClick={resetForm}>
                Cancel
              </button>
              <button
                className="module-primary-btn"
                onClick={saveAmbassador}
                disabled={!formData.name || !formData.school || saving}
              >
                {saving ? 'Saving...' : editingAmbassador ? 'Update' : 'Add Ambassador'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={deleteConfirm.show}
        title="Remove Ambassador"
        message="Are you sure you want to remove this ambassador? This action cannot be undone."
        confirmText="Remove"
        cancelText="Cancel"
        variant="danger"
        onConfirm={() => deleteConfirm.id && deleteAmbassador(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm({ show: false, id: null })}
      />

      {/* Ambassador Approved Credentials Modal */}
      {approvedCredentials && (
        <ModalOverlay className="module-modal-overlay" onClose={() => setApprovedCredentials(null)}>
          <div className="module-modal credentials-modal" onClick={(e) => e.stopPropagation()}>
            <div className="module-modal-header">
              <h2>✅ Ambassador Approved!</h2>
              <button className="module-modal-close" onClick={() => setApprovedCredentials(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="module-modal-body">
              <p style={{ color: '#6B7280', fontSize: '0.875rem', margin: '0 0 16px' }}>
                <strong>{approvedCredentials.name}</strong> has been approved and a login account has been created.
                Share these credentials with them — the password can be changed after first login.
              </p>
              <div className="credentials-box">
                <div className="credential-row">
                  <span className="credential-label">Login URL:</span>
                  <span className="credential-value">trailblaize.space</span>
                </div>
                <div className="credential-row">
                  <span className="credential-label">Email:</span>
                  <span className="credential-value">{approvedCredentials.email}</span>
                </div>
                <div className="credential-row">
                  <span className="credential-label">Password:</span>
                  <span className="credential-value">{approvedCredentials.password}</span>
                </div>
              </div>
              <button
                className="copy-credentials-btn"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `Login: trailblaize.space\nEmail: ${approvedCredentials.email}\nPassword: ${approvedCredentials.password}`
                  );
                  setCredentialsCopied(true);
                  setTimeout(() => setCredentialsCopied(false), 2000);
                }}
              >
                {credentialsCopied ? <CheckCircle2 size={16} /> : <ClipboardList size={16} />}
                {credentialsCopied ? 'Copied!' : 'Copy Credentials'}
              </button>
            </div>
            <div className="module-modal-footer">
              <button className="module-primary-btn" onClick={() => setApprovedCredentials(null)}>
                Done
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
