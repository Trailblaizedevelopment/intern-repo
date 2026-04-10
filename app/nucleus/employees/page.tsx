'use client';

import React, { useState, useEffect } from 'react';
import { ArrowLeft, Users, Plus, Search, Filter, X, Trash2, Edit2, ExternalLink, RefreshCw, Copy, Check, Eye, EyeOff, FileText, UserPlus, Clock, CheckCircle, XCircle, Star, ChevronDown, ChevronUp, Mail, Phone, Linkedin, Globe, Play, Image, LayoutDashboard } from 'lucide-react';
import Link from 'next/link';
import { Employee, EmployeeRole, ROLE_LABELS } from '@/lib/supabase';
import ConfirmModal from '@/components/ConfirmModal';
import ModalOverlay from '@/components/ModalOverlay';

// Job Application type
interface JobApplication {
  id: string;
  name: string;
  email: string;
  phone?: string;
  position: string;
  resume_url?: string;
  cover_letter?: string;
  linkedin_url?: string;
  portfolio_url?: string;
  why_trailblaize?: string;
  experience?: string;
  availability?: string;
  hours_per_week?: number;
  status: 'pending' | 'reviewing' | 'interview' | 'offered' | 'accepted' | 'rejected' | 'withdrawn';
  reviewer_id?: string;
  reviewer_notes?: string;
  rating?: number;
  source: string;
  referral_source?: string;
  applied_at: string;
  reviewed_at?: string;
}

const POSITION_LABELS: Record<string, string> = {
  growth_intern: 'Growth Intern',
  sales_intern: 'Sales Intern',
  marketing_intern: 'Marketing Intern',
  engineer: 'Software Engineer',
  operations: 'Operations',
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending Review', color: '#f59e0b' },
  reviewing: { label: 'Under Review', color: '#3b82f6' },
  interview: { label: 'Interview', color: '#8b5cf6' },
  offered: { label: 'Offer Sent', color: '#06b6d4' },
  accepted: { label: 'Accepted', color: '#10b981' },
  rejected: { label: 'Rejected', color: '#ef4444' },
  withdrawn: { label: 'Withdrawn', color: '#6b7280' },
};

// Generate a random password
function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export default function EmployeesModule() {
  // Tab state
  const [activeTab, setActiveTab] = useState<'employees' | 'applications'>('employees');

  // Employees state
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: string | null }>({ show: false, id: null });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'growth_intern' as EmployeeRole,
    seniority: 1 as 1 | 2 | 3 | 4 | 5,
    department: '',
    status: 'onboarding' as Employee['status'],
    start_date: new Date().toISOString().split('T')[0],
  });

  // Applications state
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [applicationSearch, setApplicationSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [positionFilter, setPositionFilter] = useState('all');
  const [selectedApplication, setSelectedApplication] = useState<JobApplication | null>(null);
  const [expandedApplications, setExpandedApplications] = useState<Set<string>>(new Set());

  // Fetch employees
  useEffect(() => {
    fetchEmployees();
  }, []);

  // Fetch applications when tab changes
  useEffect(() => {
    if (activeTab === 'applications') {
      fetchApplications();
    }
  }, [activeTab, statusFilter, positionFilter]);

  async function fetchEmployees() {
    setLoading(true);
    try {
      const res = await fetch('/api/employees');
      const json = await res.json();
      if (json.error) {
        console.error('Error fetching employees:', json.error);
      } else {
        setEmployees(json.data || []);
      }
    } catch (err) {
      console.error('Error fetching employees:', err);
    }
    setLoading(false);
  }

  async function fetchApplications() {
    setApplicationsLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (positionFilter !== 'all') params.set('position', positionFilter);

      const response = await fetch(`/api/applications?${params.toString()}`);
      const result = await response.json();

      if (result.error) {
        console.error('Error fetching applications:', result.error);
      } else {
        setApplications(result.data || []);
      }
    } catch (error) {
      console.error('Error fetching applications:', error);
    }
    setApplicationsLoading(false);
  }

  async function updateApplicationStatus(id: string, status: string) {
    try {
      const response = await fetch(`/api/applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      const result = await response.json();
      if (result.error) {
        console.error('Error updating application:', result.error);
        alert('Failed to update application status');
      } else {
        fetchApplications();
        if (selectedApplication?.id === id) {
          setSelectedApplication(result.data);
        }
      }
    } catch (error) {
      console.error('Error updating application:', error);
    }
  }

  async function updateApplicationRating(id: string, rating: number) {
    try {
      const response = await fetch(`/api/applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating }),
      });

      const result = await response.json();
      if (result.error) {
        console.error('Error updating rating:', result.error);
      } else {
        fetchApplications();
        if (selectedApplication?.id === id) {
          setSelectedApplication(result.data);
        }
      }
    } catch (error) {
      console.error('Error updating rating:', error);
    }
  }

  // Convert accepted application to employee
  async function convertToEmployee(application: JobApplication) {
    setFormData({
      name: application.name,
      email: application.email,
      role: application.position as EmployeeRole,
      seniority: 1,
      department: '',
      status: 'onboarding',
      start_date: new Date().toISOString().split('T')[0],
    });
    setShowModal(true);
    setSelectedApplication(null);
  }

  // Create employee with auth account via server API (bypasses email rate limits)
  async function createEmployee() {
    // Validate email for auth
    if (!formData.email) {
      alert('Email is required to create an account');
      return;
    }
    
    if (!password) {
      alert('Password is required');
      return;
    }

    try {
      const response = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: password,
          name: formData.name,
          role: formData.role,
          seniority: formData.seniority,
          department: formData.department,
          status: formData.status,
          start_date: formData.start_date,
        }),
      });

      const result = await response.json();

      if (result.error) {
        console.error('Error creating employee:', result.error);
        if (result.error.code === '23505') {
          alert('An employee with this email already exists');
        } else {
          alert(`Failed to create employee: ${result.error.message}`);
        }
        return;
      }

      // Show credentials to admin
      setCreatedCredentials({ email: formData.email, password: password });
      fetchEmployees();
    } catch (error) {
      console.error('Error creating employee:', error);
      alert('Failed to create employee. Please try again.');
    }
  }

  // Update employee
  async function updateEmployee() {
    if (!editingEmployee) return;
    try {
      const res = await fetch(`/api/employees/${editingEmployee.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (json.error) {
        console.error('Error updating employee:', json.error);
        if (json.error.code === '23505') {
          alert('An employee with this email already exists');
        } else {
          alert(`Failed to update employee: ${json.error.message}`);
        }
      } else {
        resetForm();
        fetchEmployees();
      }
    } catch (err) {
      console.error('Error updating employee:', err);
      alert('Failed to update employee. Please try again.');
    }
  }

  // Delete employee
  async function deleteEmployee(id: string) {
    try {
      const res = await fetch(`/api/employees/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.error) {
        console.error('Error deleting employee:', json.error);
        alert('Failed to delete employee');
      } else {
        fetchEmployees();
      }
    } catch (err) {
      console.error('Error deleting employee:', err);
      alert('Failed to delete employee');
    }
    setDeleteConfirm({ show: false, id: null });
  }

  function resetForm() {
    setFormData({
      name: '',
      email: '',
      role: 'growth_intern',
      seniority: 1,
      department: '',
      status: 'onboarding',
      start_date: new Date().toISOString().split('T')[0],
    });
    setPassword('');
    setShowPassword(false);
    setCopied(false);
    setEditingEmployee(null);
    setShowModal(false);
  }

  function handleGeneratePassword() {
    const newPassword = generatePassword();
    setPassword(newPassword);
  }

  function copyCredentials() {
    if (createdCredentials) {
      navigator.clipboard.writeText(`Email: ${createdCredentials.email}\nPassword: ${createdCredentials.password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function closeCredentialsModal() {
    setCreatedCredentials(null);
    resetForm();
  }

  function openEditModal(employee: Employee) {
    setEditingEmployee(employee);
    setFormData({
      name: employee.name,
      email: employee.email || '',
      role: employee.role || 'intern',
      seniority: employee.seniority || 1,
      department: employee.department || '',
      status: employee.status,
      start_date: employee.start_date,
    });
    setShowModal(true);
  }

  function toggleApplicationExpanded(id: string) {
    const newExpanded = new Set(expandedApplications);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedApplications(newExpanded);
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  // Filter employees
  const filteredEmployees = employees.filter(emp =>
    emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter applications
  const filteredApplications = applications.filter(app =>
    app.name.toLowerCase().includes(applicationSearch.toLowerCase()) ||
    app.email.toLowerCase().includes(applicationSearch.toLowerCase())
  );

  // Calculate employee stats
  const totalEmployees = employees.length;
  const activeEmployees = employees.filter(e => e.status === 'active').length;
  const onboardingEmployees = employees.filter(e => e.status === 'onboarding').length;
  const thisWeek = employees.filter(e => {
    const startDate = new Date(e.start_date);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return startDate >= weekAgo;
  }).length;

  // Calculate application stats
  const pendingApplications = applications.filter(a => a.status === 'pending').length;
  const interviewApplications = applications.filter(a => a.status === 'interview').length;
  const totalApplications = applications.length;

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
            <div className="module-icon" style={{ backgroundColor: '#3b82f615', color: '#3b82f6' }}>
              <Users size={24} />
            </div>
            <div>
              <h1>Employees & Onboarding</h1>
              <p>Manage team members, review applications, and streamline hiring workflows.</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="module-main">
        {/* Tab Navigation */}
        <div className="applications-tabs">
          <button
            className={`applications-tab ${activeTab === 'employees' ? 'active' : ''}`}
            onClick={() => setActiveTab('employees')}
          >
            <Users size={18} />
            Team Members
            <span className="tab-count">{totalEmployees}</span>
          </button>
          <button
            className={`applications-tab ${activeTab === 'applications' ? 'active' : ''}`}
            onClick={() => setActiveTab('applications')}
          >
            <FileText size={18} />
            Applications Review
            {pendingApplications > 0 && (
              <span className="tab-count pending">{pendingApplications}</span>
            )}
          </button>
        </div>

        {activeTab === 'employees' ? (
          <>
            {/* Stats Row */}
            <div className="module-stats-row">
              <div className="module-stat">
                <span className="module-stat-value">{totalEmployees}</span>
                <span className="module-stat-label">Total Employees</span>
              </div>
              <div className="module-stat">
                <span className="module-stat-value">{activeEmployees}</span>
                <span className="module-stat-label">Active</span>
              </div>
              <div className="module-stat">
                <span className="module-stat-value">{onboardingEmployees}</span>
                <span className="module-stat-label">In Onboarding</span>
              </div>
              <div className="module-stat">
                <span className="module-stat-value">{thisWeek}</span>
                <span className="module-stat-label">This Week</span>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="module-actions-bar">
              <div className="module-search">
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Search employees..."
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
                  Add Employee
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="module-table-container">
              {loading ? (
                <div className="module-loading">Loading...</div>
              ) : filteredEmployees.length > 0 ? (
                <table className="module-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Start Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((employee) => (
                      <tr key={employee.id}>
                        <td className="module-table-name">{employee.name}</td>
                        <td>{employee.email}</td>
                        <td>
                          <span className={`employee-role ${employee.role}`}>
                            {ROLE_LABELS[employee.role] || employee.role}
                          </span>
                        </td>
                        <td>
                          <span className={`module-status ${employee.status}`}>{employee.status}</span>
                        </td>
                        <td>{employee.start_date}</td>
                        <td>
                          <div className="module-table-actions">
                            <Link href="/workspace" className="module-table-action" title="View Workspace">
                              <ExternalLink size={14} />
                            </Link>
                            <button className="module-table-action" onClick={() => openEditModal(employee)}>
                              <Edit2 size={14} />
                            </button>
                            <button className="module-table-action delete" onClick={() => setDeleteConfirm({ show: true, id: employee.id })}>
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
                  <Users size={48} />
                  <h3>No employees yet</h3>
                  <p>Add your first team member to get started</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Applications Stats */}
            <div className="module-stats-row">
              <div className="module-stat">
                <span className="module-stat-value">{totalApplications}</span>
                <span className="module-stat-label">Total Applications</span>
              </div>
              <div className="module-stat">
                <span className="module-stat-value" style={{ color: '#f59e0b' }}>{pendingApplications}</span>
                <span className="module-stat-label">Pending Review</span>
              </div>
              <div className="module-stat">
                <span className="module-stat-value" style={{ color: '#8b5cf6' }}>{interviewApplications}</span>
                <span className="module-stat-label">In Interview</span>
              </div>
              <div className="module-stat">
                <span className="module-stat-value" style={{ color: '#10b981' }}>
                  {applications.filter(a => a.status === 'accepted').length}
                </span>
                <span className="module-stat-label">Accepted</span>
              </div>
            </div>

            {/* Applications Actions Bar */}
            <div className="module-actions-bar">
              <div className="module-search">
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Search applications..."
                  value={applicationSearch}
                  onChange={(e) => setApplicationSearch(e.target.value)}
                />
              </div>
              <div className="module-actions">
                <select
                  className="applications-filter-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="reviewing">Reviewing</option>
                  <option value="interview">Interview</option>
                  <option value="offered">Offered</option>
                  <option value="accepted">Accepted</option>
                  <option value="rejected">Rejected</option>
                </select>
                <select
                  className="applications-filter-select"
                  value={positionFilter}
                  onChange={(e) => setPositionFilter(e.target.value)}
                >
                  <option value="all">All Positions</option>
                  <option value="growth_intern">Growth Intern</option>
                  <option value="sales_intern">Sales Intern</option>
                  <option value="marketing_intern">Marketing Intern</option>
                  <option value="engineer">Engineer</option>
                </select>
                <button className="module-filter-btn" onClick={fetchApplications}>
                  <RefreshCw size={16} />
                  Refresh
                </button>
              </div>
            </div>

            {/* Applications List */}
            <div className="applications-list">
              {applicationsLoading ? (
                <div className="module-loading">Loading applications...</div>
              ) : filteredApplications.length > 0 ? (
                filteredApplications.map((application) => (
                  <div key={application.id} className="application-card">
                    <div
                      className="application-card-header"
                      onClick={() => toggleApplicationExpanded(application.id)}
                    >
                      <div className="application-card-main">
                        <div className="application-avatar">
                          {application.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <div className="application-info">
                          <h3>{application.name}</h3>
                          <p className="application-position">
                            {POSITION_LABELS[application.position] || application.position}
                          </p>
                          <div className="application-meta">
                            <span className="application-date">
                              <Clock size={12} />
                              Applied {formatDate(application.applied_at)}
                            </span>
                            {application.source !== 'website' && (
                              <span className="application-source">via {application.source}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="application-card-right">
                        <div className="application-rating">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              className={`rating-star ${application.rating && star <= application.rating ? 'filled' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                updateApplicationRating(application.id, star);
                              }}
                            >
                              <Star size={14} />
                            </button>
                          ))}
                        </div>
                        <span
                          className="application-status-badge"
                          style={{ backgroundColor: STATUS_LABELS[application.status]?.color || '#6b7280' }}
                        >
                          {STATUS_LABELS[application.status]?.label || application.status}
                        </span>
                        <button className="application-expand-btn">
                          {expandedApplications.has(application.id) ? (
                            <ChevronUp size={18} />
                          ) : (
                            <ChevronDown size={18} />
                          )}
                        </button>
                      </div>
                    </div>

                    {expandedApplications.has(application.id) && (
                      <div className="application-card-expanded">
                        <div className="application-details">
                          <div className="application-contact">
                            <h4>Contact Information</h4>
                            <div className="contact-items">
                              <a href={`mailto:${application.email}`} className="contact-item">
                                <Mail size={14} />
                                {application.email}
                              </a>
                              {application.phone && (
                                <a href={`tel:${application.phone}`} className="contact-item">
                                  <Phone size={14} />
                                  {application.phone}
                                </a>
                              )}
                              {application.linkedin_url && (
                                <a href={application.linkedin_url} target="_blank" rel="noopener noreferrer" className="contact-item">
                                  <Linkedin size={14} />
                                  LinkedIn Profile
                                </a>
                              )}
                              {application.portfolio_url && (
                                <a href={application.portfolio_url} target="_blank" rel="noopener noreferrer" className="contact-item">
                                  <Globe size={14} />
                                  Portfolio
                                </a>
                              )}
                            </div>
                          </div>

                          {/* Uploaded Media Section */}
                          <div className="application-media-section">
                            <h4>Submitted Files</h4>
                            {(application.portfolio_url || application.cover_letter) ? (
                              <div className="application-media-grid">
                                {/* Video from portfolio_url */}
                                {application.portfolio_url && (
                                  <div className="media-item video-item">
                                    <div className="media-label">
                                      <Play size={14} />
                                      Video Challenge
                                    </div>
                                    <video 
                                      controls 
                                      className="media-video"
                                      preload="metadata"
                                    >
                                      <source src={application.portfolio_url} />
                                      Your browser does not support video playback.
                                    </video>
                                  </div>
                                )}
                                
                                {/* Scenario proofs from cover_letter URLs */}
                                {application.cover_letter && application.cover_letter.split('\n').map((line, idx) => {
                                  const urlMatch = line.match(/(https?:\/\/[^\s]+)/);
                                  if (!urlMatch) return null;
                                  const url = urlMatch[1];
                                  const isVideo = /\.(mp4|mov|webm|avi)$/i.test(url);
                                  const label = line.split(':')[0] || `File ${idx + 1}`;
                                  
                                  return (
                                    <div key={idx} className={`media-item ${isVideo ? 'video-item' : 'image-item'}`}>
                                      <div className="media-label">
                                        {isVideo ? <Play size={14} /> : <Image size={14} />}
                                        {label}
                                      </div>
                                      {isVideo ? (
                                        <video controls className="media-video" preload="metadata">
                                          <source src={url} />
                                        </video>
                                      ) : (
                                        <a href={url} target="_blank" rel="noopener noreferrer">
                                          <img src={url} alt={label} className="media-image" />
                                        </a>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="no-files-message">
                                <FileText size={20} />
                                <span>No files were uploaded with this application</span>
                              </div>
                            )}
                          </div>

                          {application.why_trailblaize && (
                            <div className="application-section">
                              <h4>Why Trailblaize?</h4>
                              <p>{application.why_trailblaize}</p>
                            </div>
                          )}

                          {application.experience && (
                            <div className="application-section">
                              <h4>Experience</h4>
                              <p>{application.experience}</p>
                            </div>
                          )}

                          <div className="application-extra-info">
                            {application.availability && (
                              <div className="extra-info-item">
                                <span className="extra-info-label">Availability:</span>
                                <span>{application.availability}</span>
                              </div>
                            )}
                            {application.hours_per_week && (
                              <div className="extra-info-item">
                                <span className="extra-info-label">Hours/Week:</span>
                                <span>{application.hours_per_week} hours</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="application-actions">
                          <h4>Update Status</h4>
                          <div className="status-buttons">
                            <button
                              className={`status-btn reviewing ${application.status === 'reviewing' ? 'active' : ''}`}
                              onClick={() => updateApplicationStatus(application.id, 'reviewing')}
                            >
                              <Eye size={14} />
                              Reviewing
                            </button>
                            <button
                              className={`status-btn interview ${application.status === 'interview' ? 'active' : ''}`}
                              onClick={() => updateApplicationStatus(application.id, 'interview')}
                            >
                              <Clock size={14} />
                              Interview
                            </button>
                            <button
                              className={`status-btn offered ${application.status === 'offered' ? 'active' : ''}`}
                              onClick={() => updateApplicationStatus(application.id, 'offered')}
                            >
                              <Mail size={14} />
                              Send Offer
                            </button>
                            <button
                              className={`status-btn accepted ${application.status === 'accepted' ? 'active' : ''}`}
                              onClick={() => updateApplicationStatus(application.id, 'accepted')}
                            >
                              <CheckCircle size={14} />
                              Accept
                            </button>
                            <button
                              className={`status-btn rejected ${application.status === 'rejected' ? 'active' : ''}`}
                              onClick={() => updateApplicationStatus(application.id, 'rejected')}
                            >
                              <XCircle size={14} />
                              Reject
                            </button>
                          </div>

                          {application.status === 'accepted' && (
                            <button
                              className="convert-to-employee-btn"
                              onClick={() => convertToEmployee(application)}
                            >
                              <UserPlus size={16} />
                              Convert to Employee
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="module-empty-state">
                  <FileText size={48} />
                  <h3>No applications yet</h3>
                  <p>Applications from the careers page will appear here</p>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Modal */}
      {showModal && (
        <ModalOverlay className="module-modal-overlay" onClose={() => resetForm()}>
          <div className="module-modal" onClick={(e) => e.stopPropagation()}>
            <div className="module-modal-header">
              <h2>{editingEmployee ? 'Edit Employee' : 'Add Employee'}</h2>
              <button className="module-modal-close" onClick={() => resetForm()}>
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
                  <label>Email *</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@trailblaize.net"
                    disabled={!!editingEmployee}
                  />
                </div>
              </div>
              {!editingEmployee && (
                <div className="module-form-group">
                  <label>Password *</label>
                  <div className="password-input-group">
                    <div className="password-input-wrapper">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter or generate password"
                      />
                      <button
                        type="button"
                        className="password-toggle-btn"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <button
                      type="button"
                      className="password-generate-btn"
                      onClick={handleGeneratePassword}
                    >
                      <RefreshCw size={16} />
                      Generate
                    </button>
                  </div>
                </div>
              )}
              <div className="module-form-row">
                <div className="module-form-group">
                  <label>Role *</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as EmployeeRole })}
                  >
                    <option value="founder">Founder</option>
                    <option value="cofounder">Co-Founder</option>
                    <option value="growth_intern">Growth Intern</option>
                    <option value="engineer">Engineer</option>
                    <option value="sales_intern">Sales Intern</option>
                    <option value="marketing_intern">Marketing Intern</option>
                    <option value="operations">Operations</option>
                  </select>
                </div>
                <div className="module-form-group">
                  <label>Seniority Level</label>
                  <select
                    value={formData.seniority}
                    onChange={(e) => setFormData({ ...formData, seniority: parseInt(e.target.value) as 1|2|3|4|5 })}
                  >
                    <option value={1}>1 - Entry</option>
                    <option value={2}>2 - Junior</option>
                    <option value={3}>3 - Mid</option>
                    <option value={4}>4 - Senior</option>
                    <option value={5}>5 - Principal</option>
                  </select>
                </div>
              </div>
              <div className="module-form-row">
                <div className="module-form-group">
                  <label>Department</label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    placeholder="e.g. Engineering, Sales"
                  />
                </div>
                <div className="module-form-group">
                  <label>Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as Employee['status'] })}
                  >
                    <option value="onboarding">Onboarding</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="module-form-group">
                <label>Start Date</label>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>
            </div>
            <div className="module-modal-footer">
              <button className="module-cancel-btn" onClick={() => resetForm()}>
                Cancel
              </button>
              <button
                className="module-primary-btn"
                onClick={editingEmployee ? updateEmployee : createEmployee}
                disabled={!formData.name}
              >
                {editingEmployee ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteConfirm.show}
        title="Delete Employee"
        message="Are you sure you want to delete this employee? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        onConfirm={() => deleteConfirm.id && deleteEmployee(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm({ show: false, id: null })}
      />

      {/* Created Credentials Modal */}
      {createdCredentials && (
        <ModalOverlay className="module-modal-overlay" onClose={closeCredentialsModal}>
          <div className="module-modal credentials-modal" onClick={(e) => e.stopPropagation()}>
            <div className="module-modal-header">
              <h2>✅ Employee Created</h2>
              <button className="module-modal-close" onClick={closeCredentialsModal}>
                <X size={20} />
              </button>
            </div>
            <div className="module-modal-body">
              <p className="credentials-note">
                Save these credentials - the password won&apos;t be shown again!
              </p>
              <div className="credentials-box">
                <div className="credential-row">
                  <span className="credential-label">Email:</span>
                  <span className="credential-value">{createdCredentials.email}</span>
                </div>
                <div className="credential-row">
                  <span className="credential-label">Password:</span>
                  <span className="credential-value">{createdCredentials.password}</span>
                </div>
              </div>
              <button className="copy-credentials-btn" onClick={copyCredentials}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copied!' : 'Copy Credentials'}
              </button>
            </div>
            <div className="module-modal-footer">
              <button className="module-primary-btn" onClick={closeCredentialsModal}>
                Done
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
