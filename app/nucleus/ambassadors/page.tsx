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
  Filter,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { Ambassador, AmbassadorStatus } from '@/lib/supabase';
import ConfirmModal from '@/components/ConfirmModal';
import ModalOverlay from '@/components/ModalOverlay';
import { SkeletonTable } from '@/components/Skeleton';

const STATUS_CONFIG: Record<AmbassadorStatus, { label: string; color: string; bg: string }> = {
  active:   { label: 'Active',   color: '#10b981', bg: '#d1fae5' },
  inactive: { label: 'Inactive', color: '#6b7280', bg: '#f3f4f6' },
  prospect: { label: 'Prospect', color: '#f59e0b', bg: '#fef3c7' },
};

function isEmail(value: string) {
  return value.includes('@');
}

export default function AmbassadorsModule() {
  const [ambassadors, setAmbassadors] = useState<Ambassador[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AmbassadorStatus>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingAmbassador, setEditingAmbassador] = useState<Ambassador | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: string | null }>({ show: false, id: null });
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    school: '',
    contact: '',
    status: 'prospect' as AmbassadorStatus,
    notes: '',
  });

  useEffect(() => {
    fetchAmbassadors();
  }, []);

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

  // Filtered list
  const filtered = ambassadors.filter((a) => {
    const matchesSearch =
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.school.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.contact && a.contact.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Stats
  const total = ambassadors.length;
  const active = ambassadors.filter((a) => a.status === 'active').length;
  const prospects = ambassadors.filter((a) => a.status === 'prospect').length;
  const uniqueSchools = new Set(ambassadors.map((a) => a.school)).size;

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
        </div>

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
                  : 'Add your first student ambassador to get started.'}
              </p>
            </div>
          )}
        </div>
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
    </div>
  );
}
