'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase, Employee, NetworkContact } from '@/lib/supabase';
import { useUserRole } from '../hooks/useUserRole';
import { useGoogleIntegration } from '../hooks/useGoogleIntegration';
import LeadEmailHistory from '../components/LeadEmailHistory';
import {
  Target,
  Search,
  Phone,
  Mail,
  Building2,
  Calendar,
  Linkedin,
  TrendingUp,
  Users,
  Crown,
  GraduationCap,
  Link2,
  Swords,
  HelpCircle,
  DollarSign,
  Clock,
  Plus,
  Edit2,
  Trash2,
  X,
  ArrowLeft
} from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';
import ModalOverlay from '@/components/ModalOverlay';

// Lead category configuration
const LEAD_CATEGORIES = {
  chapter_presidents: {
    label: 'Chapter Presidents',
    icon: Crown,
    color: '#8b5cf6',
    bgColor: '#8b5cf615',
    contactTypes: ['chapter_president'] as NetworkContact['contact_type'][],
  },
  chapter_advisors: {
    label: 'Chapter Advisors',
    icon: GraduationCap,
    color: '#06b6d4',
    bgColor: '#06b6d415',
    contactTypes: ['chapter_advisor'] as NetworkContact['contact_type'][],
  },
  ifc: {
    label: 'IFC',
    icon: Users,
    color: '#f59e0b',
    bgColor: '#f59e0b15',
    contactTypes: ['ifc_president', 'ifc_advisor'] as NetworkContact['contact_type'][],
  },
  investors: {
    label: 'Investors',
    icon: DollarSign,
    color: '#10b981',
    bgColor: '#10b98115',
    contactTypes: ['investor', 'angel', 'vc'] as NetworkContact['contact_type'][],
  },
  partnership: {
    label: 'Partnerships',
    icon: Link2,
    color: '#3b82f6',
    bgColor: '#3b82f615',
    contactTypes: ['partnership'] as NetworkContact['contact_type'][],
  },
  competitors: {
    label: 'Competitors',
    icon: Swords,
    color: '#ef4444',
    bgColor: '#ef444415',
    contactTypes: ['competitor'] as NetworkContact['contact_type'][],
  },
  helpers: {
    label: 'Helpers',
    icon: HelpCircle,
    color: '#64748b',
    bgColor: '#64748b15',
    contactTypes: ['connector', 'consultant', 'greek_life', 'other'] as NetworkContact['contact_type'][],
  },
} as const;

type CategoryKey = keyof typeof LEAD_CATEGORIES;

const typeLabels: Record<NetworkContact['contact_type'], string> = {
  investor: 'Investor',
  angel: 'Angel',
  vc: 'VC',
  partnership: 'Partnership',
  competitor: 'Competitor',
  connector: 'Connector',
  ifc_president: 'IFC President',
  ifc_advisor: 'IFC Advisor',
  chapter_president: 'Chapter President',
  chapter_advisor: 'Chapter Advisor',
  greek_life: 'Greek Life',
  consultant: 'Consultant',
  other: 'Other',
};

const stageLabels: Record<NetworkContact['stage'], string> = {
  identified: 'Identified',
  researching: 'Researching',
  outreach_pending: 'Outreach Pending',
  first_contact: 'First Contact',
  follow_up: 'Follow Up',
  in_conversation: 'In Conversation',
  meeting_scheduled: 'Meeting Scheduled',
  met: 'Met',
  nurturing: 'Nurturing',
  committed: 'Committed',
  passed: 'Passed',
  dormant: 'Dormant',
};

const priorityColors: Record<string, { bg: string; text: string; label: string }> = {
  hot: { bg: '#fee2e2', text: '#dc2626', label: '🔥 Hot' },
  warm: { bg: '#fef3c7', text: '#d97706', label: '☀️ Warm' },
  cold: { bg: '#e0f2fe', text: '#0284c7', label: '❄️ Cold' }
};

export default function LeadsPage() {
  const { user } = useAuth();
  const { isFounder } = useUserRole();
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
  const [contacts, setContacts] = useState<NetworkContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey | null>(null);
  
  // Google integration for email history
  const { 
    status: googleStatus, 
    fetchEmailsForContact 
  } = useGoogleIntegration(currentEmployee?.id);
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingContact, setEditingContact] = useState<NetworkContact | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: string | null }>({ show: false, id: null });
  
  const [formData, setFormData] = useState({
    name: '',
    title: '',
    organization: '',
    phone: '',
    email: '',
    linkedin: '',
    contact_type: 'other' as NetworkContact['contact_type'],
    priority: 'warm' as NetworkContact['priority'],
    stage: 'identified' as NetworkContact['stage'],
    first_contact_date: '',
    last_contact_date: '',
    next_followup_date: '',
    potential_value: '',
    how_they_can_help: '',
    how_we_met: '',
    referred_by: '',
    notes: '',
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
  }, [user]);

  useEffect(() => {
    fetchEmployee();
  }, [fetchEmployee]);

  useEffect(() => {
    if (currentEmployee) {
      fetchContacts();
    }
  }, [currentEmployee]);

  async function fetchContacts() {
    if (!supabase) return;
    setLoading(true);

    const { data } = await supabase
      .from('network_contacts')
      .select('*')
      .order('priority', { ascending: true })
      .order('next_followup_date', { ascending: true });

    setContacts(data || []);
    setLoading(false);
  }

  // CRUD Operations
  async function createContact() {
    if (!supabase || !formData.name.trim()) return;
    
    const cleanedData = {
      ...formData,
      name: formData.name.trim(),
      first_contact_date: formData.first_contact_date || null,
      last_contact_date: formData.last_contact_date || null,
      next_followup_date: formData.next_followup_date || null,
    };
    
    const { error } = await supabase
      .from('network_contacts')
      .insert([cleanedData]);

    if (error) {
      alert(`Failed to create contact: ${error.message}`);
    } else {
      resetForm();
      fetchContacts();
    }
  }

  async function updateContact() {
    if (!supabase || !editingContact) return;

    const cleanedData = {
      ...formData,
      name: formData.name.trim(),
      first_contact_date: formData.first_contact_date || null,
      last_contact_date: formData.last_contact_date || null,
      next_followup_date: formData.next_followup_date || null,
    };

    const { error } = await supabase
      .from('network_contacts')
      .update(cleanedData)
      .eq('id', editingContact.id);

    if (error) {
      alert(`Failed to update contact: ${error.message}`);
    } else {
      resetForm();
      fetchContacts();
    }
  }

  async function deleteContact(id: string) {
    if (!supabase) return;

    const { error } = await supabase
      .from('network_contacts')
      .delete()
      .eq('id', id);

    if (error) {
      alert('Failed to delete contact');
    } else {
      fetchContacts();
    }
    setDeleteConfirm({ show: false, id: null });
  }

  async function logFollowup(contact: NetworkContact) {
    if (!supabase) return;
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    await supabase
      .from('network_contacts')
      .update({
        last_contact_date: today,
        next_followup_date: nextWeek,
        followup_count: (contact.followup_count || 0) + 1,
        first_contact_date: contact.first_contact_date || today,
      })
      .eq('id', contact.id);

    fetchContacts();
  }

  function resetForm() {
    setFormData({
      name: '',
      title: '',
      organization: '',
      phone: '',
      email: '',
      linkedin: '',
      contact_type: selectedCategory ? LEAD_CATEGORIES[selectedCategory].contactTypes[0] || 'other' : 'other',
      priority: 'warm',
      stage: 'identified',
      first_contact_date: '',
      last_contact_date: '',
      next_followup_date: '',
      potential_value: '',
      how_they_can_help: '',
      how_we_met: '',
      referred_by: '',
      notes: '',
    });
    setEditingContact(null);
    setShowModal(false);
  }

  function openEditModal(contact: NetworkContact) {
    setEditingContact(contact);
    setFormData({
      name: contact.name,
      title: contact.title || '',
      organization: contact.organization || '',
      phone: contact.phone || '',
      email: contact.email || '',
      linkedin: contact.linkedin || '',
      contact_type: contact.contact_type,
      priority: contact.priority,
      stage: contact.stage,
      first_contact_date: contact.first_contact_date || '',
      last_contact_date: contact.last_contact_date || '',
      next_followup_date: contact.next_followup_date || '',
      potential_value: contact.potential_value || '',
      how_they_can_help: contact.how_they_can_help || '',
      how_we_met: contact.how_we_met || '',
      referred_by: contact.referred_by || '',
      notes: contact.notes || '',
    });
    setShowModal(true);
  }

  function openAddModal() {
    setEditingContact(null);
    setFormData({
      name: '',
      title: '',
      organization: '',
      phone: '',
      email: '',
      linkedin: '',
      contact_type: selectedCategory ? LEAD_CATEGORIES[selectedCategory].contactTypes[0] || 'other' : 'other',
      priority: 'warm',
      stage: 'identified',
      first_contact_date: '',
      last_contact_date: '',
      next_followup_date: '',
      potential_value: '',
      how_they_can_help: '',
      how_we_met: '',
      referred_by: '',
      notes: '',
    });
    setShowModal(true);
  }

  // Get contacts for a category
  const getContactsByCategory = (categoryKey: CategoryKey): NetworkContact[] => {
    const category = LEAD_CATEGORIES[categoryKey];
    return contacts.filter(c => category.contactTypes.includes(c.contact_type));
  };

  // Filter contacts for display
  const displayedContacts = selectedCategory 
    ? getContactsByCategory(selectedCategory).filter(c => 
        !searchQuery || 
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.organization?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const isOverdue = (date: string | null): boolean => {
    if (!date) return false;
    return new Date(date) < new Date();
  };

  // Stats
  const totalContacts = contacts.length;
  const hotLeads = contacts.filter(c => c.priority === 'hot').length;
  const needsFollowup = contacts.filter(c => c.next_followup_date && isOverdue(c.next_followup_date)).length;

  if (loading) {
    return (
      <div className="leads-loading">
        <div className="leads-spinner" />
        <p>Loading leads...</p>
      </div>
    );
  }

  if (!isFounder) {
    return (
      <div className="leads-no-access">
        <Target size={48} />
        <h2>Founder Access Only</h2>
        <p>The leads view is available to founders and co-founders.</p>
      </div>
    );
  }

  return (
    <div className="leads-page">
      {/* Header */}
      <header className="leads-header">
        {selectedCategory ? (
          <button className="leads-back" onClick={() => setSelectedCategory(null)}>
            <ArrowLeft size={20} />
            Back to Categories
          </button>
        ) : (
          <div className="leads-title">
            <Target size={24} />
            <h1>Leads</h1>
            <span className="leads-total">{totalContacts}</span>
          </div>
        )}
      </header>

      {!selectedCategory ? (
        /* Category Grid View */
        <>
          {/* Quick Stats */}
          <div className="leads-stats">
            <div className="leads-stat">
              <span className="leads-stat-value">{totalContacts}</span>
              <span className="leads-stat-label">Total</span>
            </div>
            <div className="leads-stat hot">
              <span className="leads-stat-value">{hotLeads}</span>
              <span className="leads-stat-label">🔥 Hot</span>
            </div>
            <div className="leads-stat warning">
              <span className="leads-stat-value">{needsFollowup}</span>
              <span className="leads-stat-label">Need Follow-up</span>
            </div>
          </div>

          {/* Category Grid */}
          <div className="leads-grid">
            {(Object.keys(LEAD_CATEGORIES) as CategoryKey[]).map(categoryKey => {
              const category = LEAD_CATEGORIES[categoryKey];
              const count = getContactsByCategory(categoryKey).length;
              const Icon = category.icon;
              const hotCount = getContactsByCategory(categoryKey).filter(c => c.priority === 'hot').length;

              return (
                <button
                  key={categoryKey}
                  className="leads-card"
                  onClick={() => setSelectedCategory(categoryKey)}
                  style={{ '--card-color': category.color, '--card-bg': category.bgColor } as React.CSSProperties}
                >
                  <div className="leads-card-icon">
                    <Icon size={28} />
                  </div>
                  <div className="leads-card-info">
                    <h3>{category.label}</h3>
                    <div className="leads-card-counts">
                      <span className="leads-card-count">{count} contacts</span>
                      {hotCount > 0 && <span className="leads-card-hot">🔥 {hotCount}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        /* Category Detail View */
        <>
          {(() => {
            const category = LEAD_CATEGORIES[selectedCategory];
            const Icon = category.icon;
            return (
              <div className="leads-category-header" style={{ '--cat-color': category.color, '--cat-bg': category.bgColor } as React.CSSProperties}>
                <div className="leads-category-icon">
                  <Icon size={24} />
                </div>
                <h2>{category.label}</h2>
                <span className="leads-category-count">{displayedContacts.length}</span>
              </div>
            );
          })()}

          {/* Actions Bar */}
          <div className="leads-actions">
            <div className="leads-search">
              <Search size={18} />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button className="leads-add-btn" onClick={openAddModal}>
              <Plus size={18} />
              Add Lead
            </button>
          </div>

          {/* Contacts List */}
          <div className="leads-list">
            {displayedContacts.length === 0 ? (
              <div className="leads-empty">
                <p>No leads in this category yet</p>
                <button className="leads-add-btn" onClick={openAddModal}>
                  <Plus size={18} />
                  Add First Lead
                </button>
              </div>
            ) : (
              displayedContacts.map(contact => (
                <div 
                  key={contact.id} 
                  className={`leads-item ${isOverdue(contact.next_followup_date) ? 'overdue' : ''}`}
                >
                  <div className="leads-item-content">
                    <div className="leads-item-row">
                      <div className="leads-item-info">
                        <div className="leads-item-name">
                          <h4>{contact.name}</h4>
                          {contact.priority && (
                            <span 
                              className="leads-priority"
                              style={{ 
                                backgroundColor: priorityColors[contact.priority]?.bg,
                                color: priorityColors[contact.priority]?.text
                              }}
                            >
                              {priorityColors[contact.priority]?.label}
                            </span>
                          )}
                        </div>
                        {(contact.title || contact.organization) && (
                          <p className="leads-item-subtitle">
                            {contact.title}
                            {contact.title && contact.organization && ' @ '}
                            {contact.organization}
                          </p>
                        )}
                      </div>

                      <div className="leads-item-meta">
                        {contact.stage && (
                          <span className="leads-stage">{stageLabels[contact.stage]}</span>
                        )}
                        {contact.next_followup_date && (
                          <span className={`leads-followup ${isOverdue(contact.next_followup_date) ? 'overdue' : ''}`}>
                            <Calendar size={12} />
                            {new Date(contact.next_followup_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      <div className="leads-item-actions">
                        {contact.phone && (
                          <a href={`tel:${contact.phone}`} className="leads-action" title="Call">
                            <Phone size={14} />
                          </a>
                        )}
                        {contact.email && (
                          <a href={`mailto:${contact.email}`} className="leads-action" title="Email">
                            <Mail size={14} />
                          </a>
                        )}
                        {contact.linkedin && (
                          <a href={contact.linkedin} target="_blank" rel="noopener noreferrer" className="leads-action" title="LinkedIn">
                            <Linkedin size={14} />
                          </a>
                        )}
                        <button className="leads-action" onClick={() => logFollowup(contact)} title="Log Follow-up">
                          <Clock size={14} />
                        </button>
                        <button className="leads-action" onClick={() => openEditModal(contact)} title="Edit">
                          <Edit2 size={14} />
                        </button>
                        <button className="leads-action delete" onClick={() => setDeleteConfirm({ show: true, id: contact.id })} title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Email History Section */}
                    {contact.email && googleStatus?.connected && googleStatus?.hasGmail && (
                      <LeadEmailHistory
                        contactEmail={contact.email}
                        fetchEmailsForContact={fetchEmailsForContact}
                        isGoogleConnected={googleStatus.connected}
                        hasGmail={googleStatus.hasGmail}
                      />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <ModalOverlay className="leads-modal-overlay" onClose={() => resetForm()}>
          <div className="leads-modal" onClick={(e) => e.stopPropagation()}>
            <div className="leads-modal-header">
              <h2>{editingContact ? 'Edit Lead' : 'Add Lead'}</h2>
              <button className="leads-modal-close" onClick={() => resetForm()}>
                <X size={20} />
              </button>
            </div>
            <div className="leads-modal-body">
              <div className="leads-form-row">
                <div className="leads-form-group">
                  <label>Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Full name"
                  />
                </div>
                <div className="leads-form-group">
                  <label>Title</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g. CEO, President"
                  />
                </div>
              </div>
              <div className="leads-form-row">
                <div className="leads-form-group">
                  <label>Organization</label>
                  <input
                    type="text"
                    value={formData.organization}
                    onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                    placeholder="Company or school"
                  />
                </div>
                <div className="leads-form-group">
                  <label>Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>
              <div className="leads-form-row">
                <div className="leads-form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="leads-form-group">
                  <label>LinkedIn</label>
                  <input
                    type="url"
                    value={formData.linkedin}
                    onChange={(e) => setFormData({ ...formData, linkedin: e.target.value })}
                    placeholder="https://linkedin.com/in/..."
                  />
                </div>
              </div>
              <div className="leads-form-row thirds">
                <div className="leads-form-group">
                  <label>Type</label>
                  <select
                    value={formData.contact_type}
                    onChange={(e) => setFormData({ ...formData, contact_type: e.target.value as NetworkContact['contact_type'] })}
                  >
                    {Object.entries(typeLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="leads-form-group">
                  <label>Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as NetworkContact['priority'] })}
                  >
                    <option value="hot">🔥 Hot</option>
                    <option value="warm">☀️ Warm</option>
                    <option value="cold">❄️ Cold</option>
                  </select>
                </div>
                <div className="leads-form-group">
                  <label>Stage</label>
                  <select
                    value={formData.stage}
                    onChange={(e) => setFormData({ ...formData, stage: e.target.value as NetworkContact['stage'] })}
                  >
                    {Object.entries(stageLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="leads-form-row thirds">
                <div className="leads-form-group">
                  <label>First Contact</label>
                  <input
                    type="date"
                    value={formData.first_contact_date}
                    onChange={(e) => setFormData({ ...formData, first_contact_date: e.target.value })}
                  />
                </div>
                <div className="leads-form-group">
                  <label>Last Contact</label>
                  <input
                    type="date"
                    value={formData.last_contact_date}
                    onChange={(e) => setFormData({ ...formData, last_contact_date: e.target.value })}
                  />
                </div>
                <div className="leads-form-group">
                  <label>Next Follow-up</label>
                  <input
                    type="date"
                    value={formData.next_followup_date}
                    onChange={(e) => setFormData({ ...formData, next_followup_date: e.target.value })}
                  />
                </div>
              </div>
              <div className="leads-form-group">
                <label>How They Can Help</label>
                <textarea
                  value={formData.how_they_can_help}
                  onChange={(e) => setFormData({ ...formData, how_they_can_help: e.target.value })}
                  placeholder="What value can they bring?"
                  rows={2}
                />
              </div>
              <div className="leads-form-group">
                <label>Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional context..."
                  rows={2}
                />
              </div>
            </div>
            <div className="leads-modal-footer">
              <button className="leads-cancel-btn" onClick={() => resetForm()}>Cancel</button>
              <button
                className="leads-save-btn"
                onClick={editingContact ? updateContact : createContact}
                disabled={!formData.name}
              >
                {editingContact ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={deleteConfirm.show}
        title="Delete Lead"
        message="Are you sure you want to delete this lead? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        onConfirm={() => deleteConfirm.id && deleteContact(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm({ show: false, id: null })}
      />

      <style jsx>{`
        .leads-page {
          padding: 24px;
          max-width: 1000px;
          margin: 0 auto;
        }

        .leads-loading, .leads-no-access {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 80px 20px;
          color: var(--ws-text-secondary);
          gap: 16px;
        }

        .leads-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid var(--ws-border);
          border-top-color: var(--ws-primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .leads-header {
          margin-bottom: 24px;
        }

        .leads-title {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .leads-title h1 {
          font-size: 24px;
          font-weight: 700;
          color: var(--ws-text-primary);
          margin: 0;
        }

        .leads-total {
          background: var(--ws-bg-secondary);
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 600;
          color: var(--ws-text-secondary);
        }

        .leads-back {
          display: flex;
          align-items: center;
          gap: 8px;
          background: none;
          border: none;
          color: var(--ws-text-secondary);
          font-size: 14px;
          cursor: pointer;
          padding: 8px 0;
        }

        .leads-back:hover {
          color: var(--ws-primary);
        }

        /* Stats */
        .leads-stats {
          display: flex;
          gap: 16px;
          margin-bottom: 24px;
        }

        .leads-stat {
          background: white;
          border: 1px solid var(--ws-border);
          border-radius: 12px;
          padding: 16px 24px;
          text-align: center;
        }

        .leads-stat-value {
          display: block;
          font-size: 28px;
          font-weight: 700;
          color: var(--ws-text-primary);
        }

        .leads-stat-label {
          font-size: 13px;
          color: var(--ws-text-secondary);
        }

        .leads-stat.hot .leads-stat-value {
          color: #ef4444;
        }

        .leads-stat.warning .leads-stat-value {
          color: #f59e0b;
        }

        /* Category Grid */
        .leads-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 16px;
        }

        .leads-card {
          background: white;
          border: 1px solid var(--ws-border);
          border-radius: 16px;
          padding: 24px;
          cursor: pointer;
          text-align: left;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .leads-card:hover {
          border-color: var(--card-color);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          transform: translateY(-2px);
        }

        .leads-card-icon {
          width: 56px;
          height: 56px;
          border-radius: 14px;
          background: var(--card-bg);
          color: var(--card-color);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .leads-card-info h3 {
          font-size: 16px;
          font-weight: 600;
          color: var(--ws-text-primary);
          margin: 0 0 4px;
        }

        .leads-card-counts {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .leads-card-count {
          font-size: 13px;
          color: var(--ws-text-secondary);
        }

        .leads-card-hot {
          font-size: 12px;
          color: #ef4444;
          font-weight: 600;
        }

        /* Category Detail View */
        .leads-category-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--ws-border);
        }

        .leads-category-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: var(--cat-bg);
          color: var(--cat-color);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .leads-category-header h2 {
          font-size: 20px;
          font-weight: 600;
          color: var(--ws-text-primary);
          margin: 0;
          flex: 1;
        }

        .leads-category-count {
          background: var(--cat-bg);
          color: var(--cat-color);
          padding: 4px 14px;
          border-radius: 20px;
          font-size: 14px;
          font-weight: 600;
        }

        /* Actions Bar */
        .leads-actions {
          display: flex;
          gap: 12px;
          margin-bottom: 20px;
        }

        .leads-search {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 10px;
          background: white;
          border: 1px solid var(--ws-border);
          border-radius: 10px;
          padding: 0 14px;
        }

        .leads-search input {
          flex: 1;
          border: none;
          outline: none;
          padding: 12px 0;
          font-size: 14px;
        }

        .leads-add-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--ws-primary);
          color: white;
          border: none;
          border-radius: 10px;
          padding: 12px 20px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .leads-add-btn:hover {
          background: var(--ws-primary-dark, #2563eb);
        }

        /* Leads List */
        .leads-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .leads-empty {
          text-align: center;
          padding: 60px 20px;
          color: var(--ws-text-secondary);
        }

        .leads-empty p {
          margin-bottom: 16px;
        }

        .leads-item {
          background: white;
          border: 1px solid var(--ws-border);
          border-radius: 12px;
          padding: 16px 20px;
          transition: all 0.15s ease;
        }

        .leads-item:hover {
          border-color: var(--ws-primary);
        }

        .leads-item.overdue {
          border-left: 3px solid #ef4444;
        }

        .leads-item-content {
          display: flex;
          flex-direction: column;
        }

        .leads-item-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }

        .leads-item-info {
          flex: 1;
          min-width: 0;
        }

        .leads-item-name {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .leads-item-name h4 {
          font-size: 15px;
          font-weight: 600;
          color: var(--ws-text-primary);
          margin: 0;
        }

        .leads-priority {
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 600;
        }

        .leads-item-subtitle {
          font-size: 13px;
          color: var(--ws-text-secondary);
          margin: 4px 0 0;
        }

        .leads-item-meta {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }

        .leads-stage {
          background: #f3f4f6;
          color: #6b7280;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
        }

        .leads-followup {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: var(--ws-text-secondary);
        }

        .leads-followup.overdue {
          color: #ef4444;
          font-weight: 600;
        }

        .leads-item-actions {
          display: flex;
          align-items: center;
          gap: 4px;
          margin-left: 16px;
        }

        .leads-action {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--ws-text-secondary);
          background: var(--ws-bg-secondary);
          border: none;
          cursor: pointer;
          text-decoration: none;
          transition: all 0.15s ease;
        }

        .leads-action:hover {
          background: var(--ws-primary);
          color: white;
        }

        .leads-action.delete:hover {
          background: #ef4444;
        }

        /* Modal */
        .leads-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }

        .leads-modal {
          background: white;
          border-radius: 16px;
          width: 100%;
          max-width: 600px;
          max-height: 90vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .leads-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px;
          border-bottom: 1px solid var(--ws-border);
        }

        .leads-modal-header h2 {
          font-size: 18px;
          font-weight: 600;
          margin: 0;
        }

        .leads-modal-close {
          background: none;
          border: none;
          color: var(--ws-text-secondary);
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
        }

        .leads-modal-close:hover {
          background: var(--ws-bg-secondary);
        }

        .leads-modal-body {
          padding: 24px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .leads-form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .leads-form-row.thirds {
          grid-template-columns: 1fr 1fr 1fr;
        }

        .leads-form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .leads-form-group label {
          font-size: 13px;
          font-weight: 500;
          color: var(--ws-text-secondary);
        }

        .leads-form-group input,
        .leads-form-group select,
        .leads-form-group textarea {
          padding: 10px 12px;
          border: 1px solid var(--ws-border);
          border-radius: 8px;
          font-size: 14px;
          outline: none;
          transition: border-color 0.15s ease;
        }

        .leads-form-group input:focus,
        .leads-form-group select:focus,
        .leads-form-group textarea:focus {
          border-color: var(--ws-primary);
        }

        .leads-form-group textarea {
          resize: vertical;
        }

        .leads-modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding: 16px 24px;
          border-top: 1px solid var(--ws-border);
        }

        .leads-cancel-btn {
          padding: 10px 20px;
          border: 1px solid var(--ws-border);
          border-radius: 8px;
          background: white;
          font-size: 14px;
          cursor: pointer;
        }

        .leads-cancel-btn:hover {
          background: var(--ws-bg-secondary);
        }

        .leads-save-btn {
          padding: 10px 24px;
          border: none;
          border-radius: 8px;
          background: var(--ws-primary);
          color: white;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
        }

        .leads-save-btn:hover:not(:disabled) {
          background: var(--ws-primary-dark, #2563eb);
        }

        .leads-save-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        @media (max-width: 640px) {
          .leads-form-row,
          .leads-form-row.thirds {
            grid-template-columns: 1fr;
          }

          .leads-item-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }

          .leads-item-actions {
            margin-left: 0;
          }

          .leads-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
