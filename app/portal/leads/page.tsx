'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import ModalOverlay from '@/components/ModalOverlay';
import { supabase, Employee, ROLE_PERMISSIONS } from '@/lib/supabase';
import ModalOverlay from '@/components/ModalOverlay';
import {
  Target,
  Plus,
  Search,
  Filter,
  MoreVertical,
  Phone,
  Mail,
  Building2,
  Calendar,
  Edit3,
  Trash2,
  X,
  Check,
  UserPlus,
  TrendingUp,
  Clock,
  ChevronDown,
  AlertCircle
} from 'lucide-react';

interface PersonalLead {
  id: string;
  employee_id: string;
  name: string;
  email: string;
  phone: string;
  organization: string;
  lead_type: 'alumni' | 'chapter' | 'sponsor' | 'other';
  status: 'new' | 'contacted' | 'responding' | 'meeting_set' | 'converted' | 'lost';
  first_contact: string;
  last_contact: string;
  next_followup: string;
  notes: string;
  created_at: string;
}

type FilterStatus = 'all' | 'active' | 'new' | 'converted' | 'lost';

export default function LeadsPage() {
  const { user } = useAuth();
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
  const [leads, setLeads] = useState<PersonalLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [showNewLead, setShowNewLead] = useState(false);
  const [editingLead, setEditingLead] = useState<PersonalLead | null>(null);
  
  const [newLead, setNewLead] = useState({
    name: '',
    email: '',
    phone: '',
    organization: '',
    lead_type: 'alumni' as PersonalLead['lead_type'],
    notes: ''
  });

  const fetchEmployee = useCallback(async () => {
    if (!supabase || !user) return;

    const { data } = await supabase
      .from('employees')
      .select('*')
      .eq('email', user.email)
      .single();

    if (data) {
      setCurrentEmployee(data);
    } else {
      const { data: fallback } = await supabase
        .from('employees')
        .select('*')
        .eq('status', 'active')
        .limit(1)
        .single();
      if (fallback) setCurrentEmployee(fallback);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchEmployee();
  }, [fetchEmployee]);

  useEffect(() => {
    if (currentEmployee) {
      fetchLeads();
    }
  }, [currentEmployee]);

  async function fetchLeads() {
    if (!supabase || !currentEmployee) return;
    
    const { data } = await supabase
      .from('personal_leads')
      .select('*')
      .eq('employee_id', currentEmployee.id)
      .order('created_at', { ascending: false });
    
    setLeads(data || []);
  }

  async function createLead() {
    if (!supabase || !currentEmployee || !newLead.name.trim()) return;
    
    await supabase.from('personal_leads').insert([{
      employee_id: currentEmployee.id,
      ...newLead,
      status: 'new'
    }]);

    setNewLead({ name: '', email: '', phone: '', organization: '', lead_type: 'alumni', notes: '' });
    setShowNewLead(false);
    fetchLeads();
  }

  async function updateLead() {
    if (!supabase || !editingLead) return;
    
    await supabase.from('personal_leads').update({
      name: editingLead.name,
      email: editingLead.email,
      phone: editingLead.phone,
      organization: editingLead.organization,
      lead_type: editingLead.lead_type,
      status: editingLead.status,
      next_followup: editingLead.next_followup,
      notes: editingLead.notes
    }).eq('id', editingLead.id);

    setEditingLead(null);
    fetchLeads();
  }

  async function updateLeadStatus(lead: PersonalLead, status: PersonalLead['status']) {
    if (!supabase) return;
    
    const updateData: Record<string, unknown> = { status };
    if (status === 'contacted' && !lead.first_contact) {
      updateData.first_contact = new Date().toISOString().split('T')[0];
    }
    updateData.last_contact = new Date().toISOString().split('T')[0];
    
    await supabase.from('personal_leads').update(updateData).eq('id', lead.id);
    fetchLeads();
  }

  async function deleteLead(lead: PersonalLead) {
    if (!supabase) return;
    await supabase.from('personal_leads').delete().eq('id', lead.id);
    fetchLeads();
  }

  // Check permissions
  const hasPermission = currentEmployee && 
    (ROLE_PERMISSIONS[currentEmployee.role]?.includes('personal_leads') || 
     ROLE_PERMISSIONS[currentEmployee.role]?.includes('all'));

  // Filter leads
  const getFilteredLeads = () => {
    let filtered = [...leads];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(l => 
        l.name.toLowerCase().includes(query) ||
        l.organization?.toLowerCase().includes(query) ||
        l.email?.toLowerCase().includes(query)
      );
    }

    // Status filter
    switch (filterStatus) {
      case 'active':
        filtered = filtered.filter(l => !['converted', 'lost'].includes(l.status));
        break;
      case 'new':
        filtered = filtered.filter(l => l.status === 'new');
        break;
      case 'converted':
        filtered = filtered.filter(l => l.status === 'converted');
        break;
      case 'lost':
        filtered = filtered.filter(l => l.status === 'lost');
        break;
    }

    return filtered;
  };

  const filteredLeads = getFilteredLeads();

  // Stats
  const totalLeads = leads.length;
  const activeLeads = leads.filter(l => !['converted', 'lost'].includes(l.status)).length;
  const convertedLeads = leads.filter(l => l.status === 'converted').length;
  const needsFollowup = leads.filter(l => {
    if (!l.next_followup) return false;
    return new Date(l.next_followup) <= new Date() && !['converted', 'lost'].includes(l.status);
  }).length;

  const conversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;

  const statusColors: Record<string, { bg: string; text: string }> = {
    new: { bg: '#f3f4f6', text: '#6b7280' },
    contacted: { bg: '#dbeafe', text: '#2563eb' },
    responding: { bg: '#e0e7ff', text: '#4f46e5' },
    meeting_set: { bg: '#fef3c7', text: '#d97706' },
    converted: { bg: '#dcfce7', text: '#16a34a' },
    lost: { bg: '#fee2e2', text: '#dc2626' }
  };

  const typeLabels: Record<string, string> = {
    alumni: 'Alumni',
    chapter: 'Chapter',
    sponsor: 'Sponsor',
    other: 'Other'
  };

  if (loading) {
    return (
      <div className="portal-loading">
        <div className="portal-loading-spinner" />
        <p>Loading leads...</p>
      </div>
    );
  }

  if (!hasPermission) {
    return (
      <div className="portal-no-access">
        <Target size={48} />
        <h2>Access Restricted</h2>
        <p>Your role doesn&apos;t have access to the leads module.</p>
      </div>
    );
  }

  return (
    <div className="leads-page">
      {/* Header */}
      <header className="leads-header">
        <div className="leads-header-left">
          <h1>
            <Target size={24} />
            My Leads
          </h1>
          <span className="leads-count">{activeLeads} active</span>
        </div>
        <button 
          className="leads-new-btn"
          onClick={() => setShowNewLead(true)}
        >
          <Plus size={18} />
          Add Lead
        </button>
      </header>

      {/* Stats */}
      <div className="leads-stats">
        <div className="leads-stat">
          <UserPlus size={18} />
          <span className="leads-stat-value">{totalLeads}</span>
          <span className="leads-stat-label">Total Leads</span>
        </div>
        <div className="leads-stat">
          <Target size={18} />
          <span className="leads-stat-value">{activeLeads}</span>
          <span className="leads-stat-label">Active</span>
        </div>
        <div className="leads-stat success">
          <TrendingUp size={18} />
          <span className="leads-stat-value">{conversionRate}%</span>
          <span className="leads-stat-label">Conversion</span>
        </div>
        <div className={`leads-stat ${needsFollowup > 0 ? 'warning' : ''}`}>
          <Clock size={18} />
          <span className="leads-stat-value">{needsFollowup}</span>
          <span className="leads-stat-label">Need Follow-up</span>
        </div>
      </div>

      {/* Filters */}
      <div className="leads-filters">
        <div className="leads-search">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search leads..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="leads-filter-tabs">
          {[
            { id: 'all', label: 'All' },
            { id: 'active', label: 'Active' },
            { id: 'new', label: 'New' },
            { id: 'converted', label: 'Converted' },
            { id: 'lost', label: 'Lost' }
          ].map(tab => (
            <button
              key={tab.id}
              className={`leads-filter-tab ${filterStatus === tab.id ? 'active' : ''}`}
              onClick={() => setFilterStatus(tab.id as FilterStatus)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Leads List */}
      <div className="leads-list-container">
        {filteredLeads.length === 0 ? (
          <div className="leads-empty">
            <UserPlus size={48} />
            <h3>No leads found</h3>
            <p>{filterStatus === 'all' ? 'Add your first lead to get started' : `No ${filterStatus} leads`}</p>
            <button onClick={() => setShowNewLead(true)}>
              <Plus size={16} />
              Add Lead
            </button>
          </div>
        ) : (
          <div className="leads-grid">
            {filteredLeads.map(lead => {
              const needsAction = lead.next_followup && new Date(lead.next_followup) <= new Date() && !['converted', 'lost'].includes(lead.status);
              
              return (
                <div 
                  key={lead.id}
                  className={`leads-card ${needsAction ? 'needs-action' : ''}`}
                >
                  <div className="leads-card-header">
                    <div className="leads-card-info">
                      <h3>{lead.name}</h3>
                      {lead.organization && (
                        <span className="leads-card-org">
                          <Building2 size={12} />
                          {lead.organization}
                        </span>
                      )}
                    </div>
                    <span 
                      className="leads-card-type"
                      style={{ 
                        background: statusColors[lead.status]?.bg || '#f3f4f6',
                        color: statusColors[lead.status]?.text || '#6b7280'
                      }}
                    >
                      {lead.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="leads-card-contact">
                    {lead.email && (
                      <a href={`mailto:${lead.email}`} className="leads-contact-link">
                        <Mail size={14} />
                        {lead.email}
                      </a>
                    )}
                    {lead.phone && (
                      <a href={`tel:${lead.phone}`} className="leads-contact-link">
                        <Phone size={14} />
                        {lead.phone}
                      </a>
                    )}
                  </div>

                  <div className="leads-card-meta">
                    <span className="leads-card-type-badge">{typeLabels[lead.lead_type]}</span>
                    {lead.last_contact && (
                      <span className="leads-card-date">
                        <Calendar size={12} />
                        Last: {new Date(lead.last_contact).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  {needsAction && (
                    <div className="leads-card-alert">
                      <AlertCircle size={14} />
                      Follow-up needed
                    </div>
                  )}

                  <div className="leads-card-footer">
                    <select
                      className="leads-status-select"
                      value={lead.status}
                      onChange={(e) => updateLeadStatus(lead, e.target.value as PersonalLead['status'])}
                    >
                      <option value="new">New</option>
                      <option value="contacted">Contacted</option>
                      <option value="responding">Responding</option>
                      <option value="meeting_set">Meeting Set</option>
                      <option value="converted">Converted ✓</option>
                      <option value="lost">Lost</option>
                    </select>

                    <div className="leads-card-actions">
                      <button 
                        className="leads-card-action"
                        onClick={() => setEditingLead(lead)}
                      >
                        <Edit3 size={14} />
                      </button>
                      <button 
                        className="leads-card-action delete"
                        onClick={() => deleteLead(lead)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Lead Modal */}
      {showNewLead && (
        <ModalOverlay className="leads-modal-overlay" onClose={() => setShowNewLead(false)}>
          <div className="leads-modal" onClick={(e) => e.stopPropagation()}>
            <div className="leads-modal-header">
              <h3>Add New Lead</h3>
              <button onClick={() => setShowNewLead(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="leads-modal-body">
              <div className="leads-form-group">
                <label>Name *</label>
                <input
                  type="text"
                  value={newLead.name}
                  onChange={(e) => setNewLead({ ...newLead, name: e.target.value })}
                  placeholder="Contact name"
                  autoFocus
                />
              </div>

              <div className="leads-form-row">
                <div className="leads-form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={newLead.email}
                    onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                    placeholder="email@example.com"
                  />
                </div>

                <div className="leads-form-group">
                  <label>Phone</label>
                  <input
                    type="tel"
                    value={newLead.phone}
                    onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>

              <div className="leads-form-row">
                <div className="leads-form-group">
                  <label>Organization</label>
                  <input
                    type="text"
                    value={newLead.organization}
                    onChange={(e) => setNewLead({ ...newLead, organization: e.target.value })}
                    placeholder="Company or school"
                  />
                </div>

                <div className="leads-form-group">
                  <label>Type</label>
                  <select
                    value={newLead.lead_type}
                    onChange={(e) => setNewLead({ ...newLead, lead_type: e.target.value as PersonalLead['lead_type'] })}
                  >
                    <option value="alumni">Alumni</option>
                    <option value="chapter">Chapter Contact</option>
                    <option value="sponsor">Sponsor</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="leads-form-group">
                <label>Notes</label>
                <textarea
                  value={newLead.notes}
                  onChange={(e) => setNewLead({ ...newLead, notes: e.target.value })}
                  placeholder="Add any notes about this lead..."
                  rows={3}
                />
              </div>
            </div>

            <div className="leads-modal-footer">
              <button 
                className="leads-modal-cancel"
                onClick={() => setShowNewLead(false)}
              >
                Cancel
              </button>
              <button 
                className="leads-modal-submit"
                onClick={createLead}
                disabled={!newLead.name.trim()}
              >
                <Check size={16} />
                Add Lead
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Edit Lead Modal */}
      {editingLead && (
        <ModalOverlay className="leads-modal-overlay" onClose={() => setEditingLead(null)}>
          <div className="leads-modal" onClick={(e) => e.stopPropagation()}>
            <div className="leads-modal-header">
              <h3>Edit Lead</h3>
              <button onClick={() => setEditingLead(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="leads-modal-body">
              <div className="leads-form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={editingLead.name}
                  onChange={(e) => setEditingLead({ ...editingLead, name: e.target.value })}
                />
              </div>

              <div className="leads-form-row">
                <div className="leads-form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={editingLead.email || ''}
                    onChange={(e) => setEditingLead({ ...editingLead, email: e.target.value })}
                  />
                </div>

                <div className="leads-form-group">
                  <label>Phone</label>
                  <input
                    type="tel"
                    value={editingLead.phone || ''}
                    onChange={(e) => setEditingLead({ ...editingLead, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="leads-form-row">
                <div className="leads-form-group">
                  <label>Organization</label>
                  <input
                    type="text"
                    value={editingLead.organization || ''}
                    onChange={(e) => setEditingLead({ ...editingLead, organization: e.target.value })}
                  />
                </div>

                <div className="leads-form-group">
                  <label>Type</label>
                  <select
                    value={editingLead.lead_type}
                    onChange={(e) => setEditingLead({ ...editingLead, lead_type: e.target.value as PersonalLead['lead_type'] })}
                  >
                    <option value="alumni">Alumni</option>
                    <option value="chapter">Chapter Contact</option>
                    <option value="sponsor">Sponsor</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="leads-form-row">
                <div className="leads-form-group">
                  <label>Status</label>
                  <select
                    value={editingLead.status}
                    onChange={(e) => setEditingLead({ ...editingLead, status: e.target.value as PersonalLead['status'] })}
                  >
                    <option value="new">New</option>
                    <option value="contacted">Contacted</option>
                    <option value="responding">Responding</option>
                    <option value="meeting_set">Meeting Set</option>
                    <option value="converted">Converted</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>

                <div className="leads-form-group">
                  <label>Next Follow-up</label>
                  <input
                    type="date"
                    value={editingLead.next_followup || ''}
                    onChange={(e) => setEditingLead({ ...editingLead, next_followup: e.target.value })}
                  />
                </div>
              </div>

              <div className="leads-form-group">
                <label>Notes</label>
                <textarea
                  value={editingLead.notes || ''}
                  onChange={(e) => setEditingLead({ ...editingLead, notes: e.target.value })}
                  rows={3}
                />
              </div>
            </div>

            <div className="leads-modal-footer">
              <button 
                className="leads-modal-cancel"
                onClick={() => setEditingLead(null)}
              >
                Cancel
              </button>
              <button 
                className="leads-modal-submit"
                onClick={updateLead}
              >
                <Check size={16} />
                Save Changes
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
