'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Employee, ROLE_LABELS } from '@/lib/supabase';
import { useUserRole } from '../hooks/useUserRole';
import {
  Users,
  Mail,
  Phone,
  Calendar,
  Search,
  MoreVertical,
  MessageSquare,
  Eye,
  UserCheck
} from 'lucide-react';

export default function TeamPage() {
  const { user } = useAuth();
  const { isFounder, canViewTeamWorkspaces } = useUserRole();
  const [teamMembers, setTeamMembers] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');

  const fetchTeamMembers = useCallback(async () => {
    const res = await fetch('/api/employees?status=active');
    const result = await res.json();
    setTeamMembers(result.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTeamMembers();
  }, [fetchTeamMembers]);

  const filteredMembers = teamMembers.filter(member => {
    const matchesSearch = !searchQuery || 
      member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesRole = filterRole === 'all' || member.role === filterRole;

    return matchesSearch && matchesRole;
  });

  const uniqueRoles = [...new Set(teamMembers.map(m => m.role))];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return { bg: '#dcfce7', text: '#16a34a' };
      case 'onboarding': return { bg: '#fef3c7', text: '#d97706' };
      case 'inactive': return { bg: '#f1f5f9', text: '#64748b' };
      default: return { bg: '#f3f4f6', text: '#6b7280' };
    }
  };

  if (loading) {
    return (
      <div className="ws-loading">
        <div className="ws-loading-spinner" />
        <p>Loading team...</p>
      </div>
    );
  }

  return (
    <div className="ws-subpage">
      {/* Header */}
      <header className="ws-subpage-header">
        <div className="ws-subpage-header-left">
          <h1>
            <Users size={24} />
            Team
          </h1>
          <span className="ws-subpage-count">{teamMembers.length} members</span>
        </div>
      </header>

      {/* Stats */}
      <div className="ws-subpage-stats">
        <div className="ws-subpage-stat">
          <Users size={18} />
          <span className="ws-subpage-stat-value">{teamMembers.length}</span>
          <span className="ws-subpage-stat-label">Total Members</span>
        </div>
        <div className="ws-subpage-stat">
          <UserCheck size={18} />
          <span className="ws-subpage-stat-value">{teamMembers.filter(m => m.status === 'active').length}</span>
          <span className="ws-subpage-stat-label">Active</span>
        </div>
        <div className="ws-subpage-stat">
          <Calendar size={18} />
          <span className="ws-subpage-stat-value">{teamMembers.filter(m => m.status === 'onboarding').length}</span>
          <span className="ws-subpage-stat-label">Onboarding</span>
        </div>
      </div>

      {/* Filters */}
      <div className="ws-subpage-filters">
        <div className="ws-search-bar">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search team members..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="ws-filter-select">
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
          >
            <option value="all">All Roles</option>
            {uniqueRoles.map(role => (
              <option key={role} value={role}>{ROLE_LABELS[role]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Team Grid */}
      <div className="ws-team-grid">
        {filteredMembers.map(member => {
          const statusStyle = getStatusColor(member.status);
          
          return (
            <div key={member.id} className="ws-team-card">
              <div className="ws-team-card-header">
                <div className="ws-team-card-avatar">
                  {member.name.charAt(0)}
                </div>
                <div className="ws-team-card-info">
                  <h3>{member.name}</h3>
                  <span className="ws-team-card-role">{ROLE_LABELS[member.role]}</span>
                </div>
                <span 
                  className="ws-team-card-status"
                  style={{ background: statusStyle.bg, color: statusStyle.text }}
                >
                  {member.status}
                </span>
              </div>

              <div className="ws-team-card-contact">
                <a href={`mailto:${member.email}`} className="ws-team-contact-link">
                  <Mail size={14} />
                  {member.email}
                </a>
              </div>

              <div className="ws-team-card-meta">
                <div className="ws-team-meta-item">
                  <Calendar size={14} />
                  <span>Joined {new Date(member.start_date).toLocaleDateString()}</span>
                </div>
                <div className="ws-team-meta-item">
                  <span className="ws-team-department">{member.department}</span>
                </div>
              </div>

              <div className="ws-team-card-actions">
                <button className="ws-team-action-btn">
                  <MessageSquare size={16} />
                  Message
                </button>
                {canViewTeamWorkspaces && (
                  <button className="ws-team-action-btn">
                    <Eye size={16} />
                    View Workspace
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredMembers.length === 0 && (
        <div className="ws-subpage-empty">
          <Users size={48} />
          <h3>No team members found</h3>
          <p>Try adjusting your search or filter criteria</p>
        </div>
      )}
    </div>
  );
}
