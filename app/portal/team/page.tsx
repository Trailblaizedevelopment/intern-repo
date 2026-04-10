'use client';

import React, { useState, useEffect } from 'react';
import { Employee, ROLE_LABELS } from '@/lib/supabase';
import {
  Users,
  Search,
  Mail,
  Phone,
  Calendar,
  Building2,
  ChevronRight,
  MessageSquare
} from 'lucide-react';
import Link from 'next/link';

export default function TeamPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTeam();
  }, []);

  async function fetchTeam() {
    try {
      const res = await fetch('/api/employees?status=active');
      const result = await res.json();
      setEmployees(result.data || []);
    } catch (err) {
      console.error('Error fetching team:', err);
    }
    setLoading(false);
  }

  const filteredEmployees = employees.filter(emp =>
    emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.department?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group by department
  const departments = filteredEmployees.reduce((acc, emp) => {
    const dept = emp.department || 'General';
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(emp);
    return acc;
  }, {} as Record<string, Employee[]>);

  const getRoleColor = (role: string) => {
    const colors: Record<string, { bg: string; text: string }> = {
      founder: { bg: 'linear-gradient(135deg, #0f172a, #1e293b)', text: '#ffffff' },
      cofounder: { bg: 'linear-gradient(135deg, #1e293b, #334155)', text: '#ffffff' },
      growth_intern: { bg: '#dcfce7', text: '#16a34a' },
      engineer: { bg: '#dbeafe', text: '#2563eb' },
      sales_intern: { bg: '#fef3c7', text: '#d97706' },
      marketing_intern: { bg: '#fce7f3', text: '#be185d' },
      operations: { bg: '#e0e7ff', text: '#4f46e5' },
    };
    return colors[role] || { bg: '#f1f5f9', text: '#64748b' };
  };

  if (loading) {
    return (
      <div className="portal-loading">
        <div className="portal-loading-spinner" />
        <p>Loading team...</p>
      </div>
    );
  }

  return (
    <div className="team-page">
      {/* Header */}
      <header className="team-header">
        <div className="team-header-left">
          <h1>
            <Users size={24} />
            Team Directory
          </h1>
          <span className="team-count">{employees.length} members</span>
        </div>
      </header>

      {/* Search */}
      <div className="team-search-bar">
        <Search size={18} />
        <input
          type="text"
          placeholder="Search by name, role, or department..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Team Grid */}
      <div className="team-content">
        {Object.entries(departments).map(([dept, members]) => (
          <section key={dept} className="team-section">
            <h2 className="team-section-title">
              <Building2 size={16} />
              {dept}
              <span className="team-section-count">{members.length}</span>
            </h2>
            
            <div className="team-grid">
              {members.map(employee => {
                const roleColor = getRoleColor(employee.role);
                
                return (
                  <div key={employee.id} className="team-card">
                    <div className="team-card-header">
                      <div 
                        className="team-card-avatar"
                        style={{ 
                          background: typeof roleColor.bg === 'string' && roleColor.bg.includes('gradient') 
                            ? roleColor.bg 
                            : '#3b82f6'
                        }}
                      >
                        {employee.name.charAt(0)}
                      </div>
                      <div className="team-card-info">
                        <h3>{employee.name}</h3>
                        <span 
                          className="team-card-role"
                          style={{ 
                            background: roleColor.bg,
                            color: roleColor.text
                          }}
                        >
                          {ROLE_LABELS[employee.role]}
                        </span>
                      </div>
                    </div>

                    <div className="team-card-details">
                      {employee.email && (
                        <a href={`mailto:${employee.email}`} className="team-card-link">
                          <Mail size={14} />
                          {employee.email}
                        </a>
                      )}
                      {employee.start_date && (
                        <span className="team-card-detail">
                          <Calendar size={14} />
                          Joined {new Date(employee.start_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                        </span>
                      )}
                    </div>

                    <div className="team-card-footer">
                      <Link href={`/portal/inbox?compose=true&to=${employee.id}`} className="team-card-action">
                        <MessageSquare size={14} />
                        Message
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {filteredEmployees.length === 0 && (
          <div className="team-empty">
            <Users size={48} />
            <h3>No team members found</h3>
            <p>Try adjusting your search query</p>
          </div>
        )}
      </div>
    </div>
  );
}
