'use client';

import React, { useState, useEffect } from 'react';
import { ArrowLeft, Building2, Plus, Search, Filter, X, Trash2, Edit2, LayoutDashboard } from 'lucide-react';
import Link from 'next/link';
import { supabase, EnterpriseContract } from '@/lib/supabase';
import ConfirmModal from '@/components/ConfirmModal';
import ModalOverlay from '@/components/ModalOverlay';
import { SkeletonTable } from '@/components/Skeleton';

export default function EnterpriseModule() {
  const [contracts, setContracts] = useState<EnterpriseContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingContract, setEditingContract] = useState<EnterpriseContract | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: string | null }>({ show: false, id: null });
  const [formData, setFormData] = useState({
    organization: '',
    type: 'other' as EnterpriseContract['type'],
    contact_name: '',
    contact_email: '',
    stage: 'prospecting' as EnterpriseContract['stage'],
    value: 0,
    notes: '',
  });

  // Fetch contracts
  useEffect(() => {
    fetchContracts();
  }, []);

  async function fetchContracts() {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('enterprise_contracts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching contracts:', error);
    } else {
      setContracts(data || []);
    }
    setLoading(false);
  }

  // Create contract
  async function createContract() {
    if (!supabase) return;
    const { error } = await supabase
      .from('enterprise_contracts')
      .insert([formData]);

    if (error) {
      console.error('Error creating contract:', error);
      alert('Failed to create contract');
    } else {
      resetForm();
      fetchContracts();
    }
  }

  // Update contract
  async function updateContract() {
    if (!supabase || !editingContract) return;

    const { error } = await supabase
      .from('enterprise_contracts')
      .update(formData)
      .eq('id', editingContract.id);

    if (error) {
      console.error('Error updating contract:', error);
      alert('Failed to update contract');
    } else {
      resetForm();
      fetchContracts();
    }
  }

  // Delete contract
  async function deleteContract(id: string) {
    if (!supabase) return;

    const { error } = await supabase
      .from('enterprise_contracts')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting contract:', error);
      alert('Failed to delete contract');
    } else {
      fetchContracts();
    }
    setDeleteConfirm({ show: false, id: null });
  }

  function resetForm() {
    setFormData({
      organization: '',
      type: 'other',
      contact_name: '',
      contact_email: '',
      stage: 'prospecting',
      value: 0,
      notes: '',
    });
    setEditingContract(null);
    setShowModal(false);
  }

  function openEditModal(contract: EnterpriseContract) {
    setEditingContract(contract);
    setFormData({
      organization: contract.organization,
      type: contract.type,
      contact_name: contract.contact_name || '',
      contact_email: contract.contact_email || '',
      stage: contract.stage,
      value: contract.value || 0,
      notes: contract.notes || '',
    });
    setShowModal(true);
  }

  // Filter contracts
  const filteredContracts = contracts.filter(c =>
    c.organization.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.contact_name && c.contact_name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Calculate stats
  const activeContracts = contracts.filter(c => c.stage === 'signed').length;
  const inNegotiation = contracts.filter(c => c.stage === 'negotiation' || c.stage === 'contract_sent').length;
  const totalValue = contracts.filter(c => c.stage === 'signed').reduce((sum, c) => sum + (c.value || 0), 0);
  const pendingSignatures = contracts.filter(c => c.stage === 'contract_sent').length;

  const typeLabels: Record<EnterpriseContract['type'], string> = {
    ifc: 'IFC',
    national_org: 'National Org',
    partnership: 'Partnership',
    other: 'Other',
  };

  const stageLabels: Record<EnterpriseContract['stage'], string> = {
    prospecting: 'Prospecting',
    negotiation: 'Negotiation',
    contract_sent: 'Contract Sent',
    signed: 'Signed',
    lost: 'Lost',
  };

  function formatCurrency(value: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  }

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
            <div className="module-icon" style={{ backgroundColor: '#06b6d415', color: '#06b6d4' }}>
              <Building2 size={24} />
            </div>
            <div>
              <h1>Enterprise Contracts</h1>
              <p>Manage enterprise deals with IFCs, national organizations, and large partnerships.</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="module-main">
        {/* Stats Row */}
        <div className="module-stats-row">
          <div className="module-stat">
            <span className="module-stat-value">{activeContracts}</span>
            <span className="module-stat-label">Active Contracts</span>
          </div>
          <div className="module-stat">
            <span className="module-stat-value">{inNegotiation}</span>
            <span className="module-stat-label">In Negotiation</span>
          </div>
          <div className="module-stat">
            <span className="module-stat-value">{formatCurrency(totalValue)}</span>
            <span className="module-stat-label">Total Value</span>
          </div>
          <div className="module-stat">
            <span className="module-stat-value">{pendingSignatures}</span>
            <span className="module-stat-label">Pending Signatures</span>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="module-actions-bar">
          <div className="module-search">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search contracts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="module-actions">
            <button className="module-filter-btn">
              <Filter size={16} />
              Filter
            </button>
            <button className="module-primary-btn" onClick={() => setShowModal(true)}>
              <Plus size={18} />
              New Contract
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="module-table-container">
          {loading ? (
            <SkeletonTable rows={5} cols={6} />
          ) : filteredContracts.length > 0 ? (
            <table className="module-table">
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Type</th>
                  <th>Stage</th>
                  <th>Value</th>
                  <th>Contact</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredContracts.map((contract) => (
                  <tr key={contract.id}>
                    <td className="module-table-name">{contract.organization}</td>
                    <td>
                      <span className={`module-type ${contract.type}`}>{typeLabels[contract.type]}</span>
                    </td>
                    <td>
                      <span className={`module-status ${contract.stage}`}>{stageLabels[contract.stage]}</span>
                    </td>
                    <td>{formatCurrency(contract.value)}</td>
                    <td>{contract.contact_name || '—'}</td>
                    <td>
                      <div className="module-table-actions">
                        <button className="module-table-action" onClick={() => openEditModal(contract)}>
                          <Edit2 size={14} />
                        </button>
                        <button className="module-table-action delete" onClick={() => setDeleteConfirm({ show: true, id: contract.id })}>
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
              <Building2 size={48} />
              <h3>No enterprise contracts yet</h3>
              <p>Add contracts to track enterprise partnerships</p>
            </div>
          )}
        </div>
      </main>

      {/* Modal */}
      {showModal && (
        <ModalOverlay className="module-modal-overlay" onClose={() => resetForm()}>
          <div className="module-modal" onClick={(e) => e.stopPropagation()}>
            <div className="module-modal-header">
              <h2>{editingContract ? 'Edit Contract' : 'New Contract'}</h2>
              <button className="module-modal-close" onClick={() => resetForm()}>
                <X size={20} />
              </button>
            </div>
            <div className="module-modal-body">
              <div className="module-form-group">
                <label>Organization *</label>
                <input
                  type="text"
                  value={formData.organization}
                  onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                  placeholder="Organization name"
                />
              </div>
              <div className="module-form-group">
                <label>Type</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as EnterpriseContract['type'] })}
                >
                  <option value="ifc">IFC (Interfraternity Council)</option>
                  <option value="national_org">National Organization</option>
                  <option value="partnership">Partnership</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="module-form-group">
                <label>Contact Name</label>
                <input
                  type="text"
                  value={formData.contact_name}
                  onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                  placeholder="Main point of contact"
                />
              </div>
              <div className="module-form-group">
                <label>Contact Email</label>
                <input
                  type="email"
                  value={formData.contact_email}
                  onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                  placeholder="Email address"
                />
              </div>
              <div className="module-form-group">
                <label>Stage</label>
                <select
                  value={formData.stage}
                  onChange={(e) => setFormData({ ...formData, stage: e.target.value as EnterpriseContract['stage'] })}
                >
                  <option value="prospecting">Prospecting</option>
                  <option value="negotiation">Negotiation</option>
                  <option value="contract_sent">Contract Sent</option>
                  <option value="signed">Signed</option>
                  <option value="lost">Lost</option>
                </select>
              </div>
              <div className="module-form-group">
                <label>Contract Value ($)</label>
                <input
                  type="number"
                  value={formData.value}
                  onChange={(e) => setFormData({ ...formData, value: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
              <div className="module-form-group">
                <label>Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Add any notes..."
                  rows={3}
                />
              </div>
            </div>
            <div className="module-modal-footer">
              <button className="module-cancel-btn" onClick={() => resetForm()}>
                Cancel
              </button>
              <button
                className="module-primary-btn"
                onClick={editingContract ? updateContract : createContract}
                disabled={!formData.organization}
              >
                {editingContract ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteConfirm.show}
        title="Delete Contract"
        message="Are you sure you want to delete this enterprise contract?"
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        onConfirm={() => deleteConfirm.id && deleteContract(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm({ show: false, id: null })}
      />
    </div>
  );
}
