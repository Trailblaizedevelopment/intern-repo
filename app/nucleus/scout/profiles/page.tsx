'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  LayoutDashboard,
  Users,
  Search,
  X,
  Edit2,
  MessageCircle,
  Calendar,
  MapPin,
  Briefcase,
  GraduationCap,
  UserPlus,
  Loader2,
  Send,
  Zap,
} from 'lucide-react';
import { ScoutProfile, SCOUT_LINES } from '../mock-data';

type OptInFilter = 'all' | 'opted_in' | 'opted_out' | 'pending';
type SortField = 'name' | 'last_contact' | 'profile_complete';

interface SearchResult {
  id: string;
  name: string;
  phone: string | null;
  source_type: 'platform_profile';
  university: string | null;
  chapter: string | null;
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getCompletenessColor(pct: number): string {
  if (pct < 30) return '#ef4444';
  if (pct < 70) return '#f59e0b';
  return '#10b981';
}

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<ScoutProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [optInFilter, setOptInFilter] = useState<OptInFilter>('all');
  const [sortField, setSortField] = useState<SortField>('last_contact');
  const [selectedProfile, setSelectedProfile] = useState<ScoutProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<ScoutProfile>>({});
  const [profileConversations, setProfileConversations] = useState<Array<{ id: string; direction: string; message_body: string; created_at: string }>>([]);

  // Pilot Picker state
  const [showPicker, setShowPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerResults, setPickerResults] = useState<SearchResult[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerAdding, setPickerAdding] = useState<string | null>(null);

  // Message composer state
  const [composerText, setComposerText] = useState('');
  const [composerLine, setComposerLine] = useState<string>(SCOUT_LINES[0].phone);
  const [composerSending, setComposerSending] = useState(false);

  const fetchProfiles = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (optInFilter !== 'all') params.set('opt_in', optInFilter);
      if (sortField) params.set('sort', sortField);
      if (searchQuery) params.set('search', searchQuery);

      const res = await fetch(`/api/scout/profiles?${params}`);
      const json = await res.json();
      if (json.data) setProfiles(json.data);
    } catch (err) {
      console.error('Failed to fetch profiles:', err);
    } finally {
      setLoading(false);
    }
  }, [optInFilter, sortField, searchQuery]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  // Fetch conversations for selected profile
  useEffect(() => {
    if (!selectedProfile) {
      setProfileConversations([]);
      return;
    }
    async function loadConvos() {
      try {
        const res = await fetch(`/api/scout/conversations?phone=${encodeURIComponent(selectedProfile!.phone_number)}&limit=10`);
        const json = await res.json();
        if (json.data) setProfileConversations(json.data);
      } catch {
        setProfileConversations([]);
      }
    }
    loadConvos();
  }, [selectedProfile]);

  async function sendMessage() {
    if (!selectedProfile || !composerText.trim()) return;
    setComposerSending(true);
    try {
      const res = await fetch('/api/scout/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_phone: selectedProfile.phone_number,
          message: composerText.trim(),
          from_phone: composerLine,
        }),
      });
      const json = await res.json();
      if (json.data) {
        setProfileConversations(prev => [...prev, json.data]);
        setComposerText('');
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setComposerSending(false);
    }
  }

  async function startConversation() {
    if (!selectedProfile) return;
    setComposerSending(true);
    try {
      const res = await fetch('/api/scout/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_phone: selectedProfile.phone_number,
          from_phone: composerLine,
          auto_generate: true,
          profile_id: selectedProfile.id,
        }),
      });
      const json = await res.json();
      if (json.data) {
        setProfileConversations(prev => [...prev, json.data]);
      }
    } catch (err) {
      console.error('Failed to start conversation:', err);
    } finally {
      setComposerSending(false);
    }
  }

  // Pilot picker search with debounce
  useEffect(() => {
    if (!showPicker || pickerQuery.length < 2) {
      setPickerResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setPickerLoading(true);
      try {
        const res = await fetch(`/api/scout/profiles/search?q=${encodeURIComponent(pickerQuery)}`);
        const json = await res.json();
        if (json.data) setPickerResults(json.data);
      } catch {
        setPickerResults([]);
      } finally {
        setPickerLoading(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [pickerQuery, showPicker]);

  async function addToScout(result: SearchResult) {
    setPickerAdding(result.id);
    try {
      const res = await fetch('/api/scout/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_type: result.source_type, source_id: result.id }),
      });
      const json = await res.json();
      if (json.data) {
        setProfiles(prev => [json.data, ...prev]);
        setPickerResults(prev => prev.filter(r => r.id !== result.id));
      }
    } catch (err) {
      console.error('Failed to add to Scout:', err);
    } finally {
      setPickerAdding(null);
    }
  }

  const filteredProfiles = useMemo(() => {
    return profiles;
  }, [profiles]);

  function openProfile(profile: ScoutProfile) {
    setSelectedProfile(profile);
    setEditForm(profile);
    setIsEditing(false);
  }

  async function saveEdit() {
    if (!selectedProfile) return;
    try {
      const res = await fetch('/api/scout/profiles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedProfile.id, ...editForm }),
      });
      const json = await res.json();
      if (json.data) {
        setProfiles(prev => prev.map(p => p.id === selectedProfile.id ? json.data : p));
        setSelectedProfile(json.data);
      }
    } catch (err) {
      console.error('Failed to save edit:', err);
    }
    setIsEditing(false);
  }

  if (loading) {
    return (
      <div className="module-page">
        <div className="module-empty-state">
          <Loader2 size={32} className="animate-spin" />
          <p>Loading profiles...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="module-page">
      <header className="module-header">
        <div className="module-header-content">
          <div className="module-back-links">
            <Link href="/nucleus/scout" className="module-back">
              <ArrowLeft size={20} />
              Back to Scout
            </Link>
            <Link href="/workspace" className="module-back">
              <LayoutDashboard size={20} />
              Workspace
            </Link>
          </div>
          <div className="module-title-row">
            <div className="module-icon" style={{ backgroundColor: '#10b98115', color: '#10b981' }}>
              <Users size={24} />
            </div>
            <div>
              <h1>Member Profiles</h1>
              <p>{profiles.length} members tracked</p>
            </div>
          </div>
        </div>
      </header>

      <main className="module-main">
        {/* Actions Bar */}
        <div className="module-actions-bar">
          <div className="module-search">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search by name, phone, or university..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="module-actions">
            <button
              className="module-primary-btn"
              onClick={() => setShowPicker(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <UserPlus size={16} />
              Add to Scout
            </button>
            <select
              className="applications-filter-select"
              value={optInFilter}
              onChange={(e) => setOptInFilter(e.target.value as OptInFilter)}
            >
              <option value="all">All Status</option>
              <option value="opted_in">Opted In</option>
              <option value="pending">Pending</option>
              <option value="opted_out">Opted Out</option>
            </select>
            <select
              className="applications-filter-select"
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
            >
              <option value="last_contact">Last Contact</option>
              <option value="name">Name</option>
              <option value="profile_complete">Completeness</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="module-table-container">
          {filteredProfiles.length === 0 ? (
            <div className="module-empty-state">
              <Users size={48} />
              <h3>No profiles yet</h3>
              <p>Click &quot;Add to Scout&quot; to select people from your existing contacts.</p>
            </div>
          ) : (
            <table className="module-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>University</th>
                  <th>Chapter</th>
                  <th>Status</th>
                  <th>Completeness</th>
                  <th>Last Contact</th>
                  <th>Next Followup</th>
                </tr>
              </thead>
              <tbody>
                {filteredProfiles.map((profile) => (
                  <tr
                    key={profile.id}
                    onClick={() => openProfile(profile)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="module-table-name">{profile.name}</td>
                    <td>{profile.university || '—'}</td>
                    <td>{profile.chapter || '—'}</td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 10px',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color:
                            profile.opt_in_status === 'opted_in'
                              ? '#065f46'
                              : profile.opt_in_status === 'pending'
                              ? '#92400e'
                              : '#6b7280',
                          backgroundColor:
                            profile.opt_in_status === 'opted_in'
                              ? '#d1fae5'
                              : profile.opt_in_status === 'pending'
                              ? '#fef3c7'
                              : '#f3f4f6',
                        }}
                      >
                        {profile.opt_in_status.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div
                          style={{
                            width: '60px',
                            height: '6px',
                            background: '#f3f4f6',
                            borderRadius: '3px',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${profile.profile_complete}%`,
                              height: '100%',
                              background: getCompletenessColor(profile.profile_complete),
                              borderRadius: '3px',
                            }}
                          />
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          {profile.profile_complete}%
                        </span>
                      </div>
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: '#6b7280' }}>
                      {profile.last_contact ? formatRelativeTime(profile.last_contact) : '—'}
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: '#6b7280' }}>
                      {profile.next_followup
                        ? new Date(profile.next_followup).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* Pilot Picker Modal */}
      {showPicker && (
        <>
          <div
            onClick={() => setShowPicker(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 200 }}
          />
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '520px',
              maxWidth: '90vw',
              maxHeight: '70vh',
              background: 'white',
              borderRadius: '12px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
              zIndex: 201,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '20px 20px 0', borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>Add to Scout</h2>
                <button
                  onClick={() => setShowPicker(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: '4px', display: 'flex' }}
                >
                  <X size={20} />
                </button>
              </div>
              <div style={{ position: 'relative', marginBottom: '16px' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input
                  type="text"
                  placeholder="Search by name, phone, or email..."
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 36px',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    fontSize: '0.875rem',
                    fontFamily: 'inherit',
                    outline: 'none',
                  }}
                />
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 20px' }}>
              {pickerQuery.length < 2 && (
                <p style={{ color: '#6b7280', fontSize: '0.875rem', textAlign: 'center', padding: '20px 0' }}>
                  Type at least 2 characters to search...
                </p>
              )}
              {pickerLoading && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
                  <Loader2 size={20} className="animate-spin" style={{ color: '#6b7280' }} />
                </div>
              )}
              {!pickerLoading && pickerQuery.length >= 2 && pickerResults.length === 0 && (
                <p style={{ color: '#6b7280', fontSize: '0.875rem', textAlign: 'center', padding: '20px 0' }}>
                  No matching contacts found, or all matches are already in Scout.
                </p>
              )}
              {pickerResults.map((result) => (
                <div
                  key={`${result.source_type}-${result.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    marginBottom: '8px',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{result.name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      {result.phone || 'No phone'} · {result.source_type.replace('_', ' ')}
                      {result.university ? ` · ${result.university}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => addToScout(result)}
                    disabled={pickerAdding === result.id || !result.phone}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      background: pickerAdding === result.id ? '#d1d5db' : '#10b981',
                      color: 'white',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: pickerAdding === result.id ? 'default' : 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {pickerAdding === result.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <UserPlus size={12} />
                    )}
                    Add
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Detail Panel */}
      {selectedProfile && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '480px',
            maxWidth: '100vw',
            background: 'white',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
            zIndex: 100,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              position: 'sticky',
              top: 0,
              background: 'white',
              zIndex: 1,
            }}
          >
            <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>
              {selectedProfile.name}
            </h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => {
                  if (isEditing) saveEdit();
                  else setIsEditing(true);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb',
                  background: isEditing ? '#10b981' : 'white',
                  color: isEditing ? 'white' : '#374151',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <Edit2 size={12} />
                {isEditing ? 'Save' : 'Edit'}
              </button>
              <button
                onClick={() => setSelectedProfile(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: '4px', display: 'flex' }}
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <div style={{ padding: '20px', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <span
                style={{
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color:
                    selectedProfile.opt_in_status === 'opted_in'
                      ? '#065f46'
                      : selectedProfile.opt_in_status === 'pending'
                      ? '#92400e'
                      : '#6b7280',
                  backgroundColor:
                    selectedProfile.opt_in_status === 'opted_in'
                      ? '#d1fae5'
                      : selectedProfile.opt_in_status === 'pending'
                      ? '#fef3c7'
                      : '#f3f4f6',
                }}
              >
                {selectedProfile.opt_in_status.replace('_', ' ')}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ height: '6px', background: '#f3f4f6', borderRadius: '3px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${selectedProfile.profile_complete}%`,
                      height: '100%',
                      background: getCompletenessColor(selectedProfile.profile_complete),
                      borderRadius: '3px',
                    }}
                  />
                </div>
              </div>
              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                {selectedProfile.profile_complete}%
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {[
                { icon: GraduationCap, label: 'University', key: 'university' as const },
                { icon: Users, label: 'Chapter', key: 'chapter' as const },
                { icon: MapPin, label: 'Location', key: 'location' as const },
                { icon: Briefcase, label: 'Current Role', key: 'current_title' as const },
                { icon: Calendar, label: 'Graduation', key: 'graduation_year' as const },
              ].map(({ icon: Icon, label, key }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Icon size={14} style={{ color: '#9ca3af', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', width: '80px', flexShrink: 0 }}>
                    {label}
                  </span>
                  {isEditing ? (
                    <input
                      type="text"
                      value={String(editForm[key] ?? selectedProfile[key] ?? '')}
                      onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })}
                      style={{
                        flex: 1,
                        padding: '4px 8px',
                        borderRadius: '4px',
                        border: '1px solid #e5e7eb',
                        fontSize: '0.8125rem',
                        fontFamily: 'inherit',
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: '0.8125rem', color: '#111827' }}>
                      {String(selectedProfile[key] ?? '—')}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {selectedProfile.career_interest && (
              <div style={{ marginTop: '20px' }}>
                <h4 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', marginBottom: '6px' }}>
                  Career Interest
                </h4>
                <p style={{ fontSize: '0.8125rem', color: '#111827', margin: 0 }}>
                  {selectedProfile.career_interest}
                </p>
              </div>
            )}

            {selectedProfile.looking_for && (
              <div style={{ marginTop: '16px' }}>
                <h4 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', marginBottom: '6px' }}>
                  Looking For
                </h4>
                <p style={{ fontSize: '0.8125rem', color: '#111827', margin: 0 }}>
                  {selectedProfile.looking_for}
                </p>
              </div>
            )}

            {selectedProfile.goals && (selectedProfile.goals as string[]).length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <h4 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', marginBottom: '6px' }}>Goals</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {(selectedProfile.goals as string[]).map((goal, i) => (
                    <span key={i} style={{ padding: '4px 10px', borderRadius: '6px', background: '#eff6ff', color: '#1d4ed8', fontSize: '0.75rem', fontWeight: 500 }}>
                      {goal}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selectedProfile.skills && (selectedProfile.skills as string[]).length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <h4 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', marginBottom: '6px' }}>Skills</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {(selectedProfile.skills as string[]).map((skill, i) => (
                    <span key={i} style={{ padding: '4px 10px', borderRadius: '6px', background: '#f0fdf4', color: '#166534', fontSize: '0.75rem', fontWeight: 500 }}>
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selectedProfile.notes && (
              <div style={{ marginTop: '16px' }}>
                <h4 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', marginBottom: '6px' }}>Notes</h4>
                <p style={{ fontSize: '0.8125rem', color: '#374151', margin: 0, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px 12px', lineHeight: '1.5' }}>
                  {selectedProfile.notes}
                </p>
              </div>
            )}

            {/* Linked Conversations */}
            <div style={{ marginTop: '24px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
              <h4 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MessageCircle size={12} />
                Recent Messages ({profileConversations.length})
              </h4>
              {profileConversations.slice(0, 5).map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: msg.direction === 'outbound' ? '#f0f9ff' : '#f9fafb',
                    marginBottom: '6px',
                    borderLeft: `3px solid ${msg.direction === 'outbound' ? '#3b82f6' : '#d1d5db'}`,
                  }}
                >
                  <p style={{ fontSize: '0.8125rem', color: '#374151', margin: 0, lineHeight: '1.4' }}>
                    {msg.message_body.length > 100 ? msg.message_body.substring(0, 100) + '...' : msg.message_body}
                  </p>
                  <span style={{ fontSize: '0.6875rem', color: '#9ca3af' }}>
                    {formatRelativeTime(msg.created_at)} · {msg.direction}
                  </span>
                </div>
              ))}
              {profileConversations.length === 0 && (
                <p style={{ fontSize: '0.8125rem', color: '#9ca3af', fontStyle: 'italic' }}>No conversations yet</p>
              )}

              {/* Message Composer */}
              <div style={{ marginTop: '14px', padding: '12px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <select
                    value={composerLine}
                    onChange={(e) => setComposerLine(e.target.value)}
                    style={{ flex: '0 0 auto', padding: '6px 8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.75rem', fontFamily: 'inherit', background: 'white' }}
                  >
                    {SCOUT_LINES.map((line) => (
                      <option key={line.phone} value={line.phone}>{line.label}&apos;s line</option>
                    ))}
                  </select>
                </div>

                {profileConversations.length === 0 ? (
                  <button
                    onClick={startConversation}
                    disabled={composerSending}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '10px 14px',
                      borderRadius: '6px',
                      border: 'none',
                      background: composerSending ? '#d1d5db' : '#8b5cf6',
                      color: 'white',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      cursor: composerSending ? 'default' : 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {composerSending ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                    {composerSending ? 'Generating...' : 'Start Conversation (AI Draft)'}
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={composerText}
                      onChange={(e) => setComposerText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                      placeholder="Type a message..."
                      style={{ flex: 1, padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.8125rem', fontFamily: 'inherit' }}
                    />
                    <button
                      onClick={sendMessage}
                      disabled={composerSending || !composerText.trim()}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '8px 14px',
                        borderRadius: '6px',
                        border: 'none',
                        background: composerSending || !composerText.trim() ? '#d1d5db' : '#3b82f6',
                        color: 'white',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        cursor: composerSending || !composerText.trim() ? 'default' : 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {composerSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedProfile && (
        <div
          onClick={() => setSelectedProfile(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.15)', zIndex: 99 }}
        />
      )}
    </div>
  );
}
