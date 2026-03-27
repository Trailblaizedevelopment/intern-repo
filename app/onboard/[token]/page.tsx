'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  Check, ChevronRight, ChevronLeft, Upload, X, Plus, Trash2, 
  AlertCircle, CheckCircle2, Building2, Users, Share2, FileSpreadsheet,
  Calendar, Instagram, Send, Loader2
} from 'lucide-react';
import {
  GREEK_ORGANIZATIONS,
  UNIVERSITIES,
  ExecutivePosition,
  EXECUTIVE_POSITION_LABELS,
  OnboardingFormData,
  OutreachChannelType,
  OUTREACH_CHANNEL_LABELS,
} from '@/lib/supabase';

// Default booking link fallback
const DEFAULT_BOOKING_LINK = '';

interface ValidationErrors {
  [key: string]: string;
}

interface Executive {
  id: string;
  full_name: string;
  position: ExecutivePosition;
  custom_position: string;
  email: string;
}

interface OutreachChannel {
  type: OutreachChannelType;
  email_platform?: string;
  email_subscriber_count?: number;
  facebook_url?: string;
  facebook_member_count?: number;
  instagram_handle?: string;
  instagram_follower_count?: number;
  linkedin_url?: string;
  linkedin_member_count?: number;
  website_url?: string;
  description?: string;
}

const SECTIONS = [
  { id: 1, title: 'Chapter Information', icon: Building2 },
  { id: 2, title: 'Executive Board', icon: Users },
  { id: 3, title: 'Outreach Channels', icon: Share2 },
  { id: 4, title: 'Alumni List', icon: FileSpreadsheet },
  { id: 5, title: 'Schedule Demo', icon: Calendar },
  { id: 6, title: 'Instagram Launch', icon: Instagram },
  { id: 7, title: 'Submit', icon: Send },
];

const COMMUNICATION_METHODS = ['Email', 'Physical Mail', 'Both Email and Mail'];

export default function OnboardingForm() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  // State
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [chapterInfo, setChapterInfo] = useState<{
    chapter_id: string;
    chapter_name: string;
    school: string;
    fraternity: string;
    already_submitted: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentSection, setCurrentSection] = useState(1);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

  // Form Data
  const [university, setUniversity] = useState('');
  const [universitySearch, setUniversitySearch] = useState('');
  const [showUniversitySuggestions, setShowUniversitySuggestions] = useState(false);
  const [fraternity, setFraternity] = useState('');
  const [fraternitySearch, setFraternitySearch] = useState('');
  const [showFraternitySuggestions, setShowFraternitySuggestions] = useState(false);
  const [chapterDesignation, setChapterDesignation] = useState('');
  const [yearFounded, setYearFounded] = useState<number | ''>('');
  const [estimatedAlumni, setEstimatedAlumni] = useState<number | ''>('');
  const [activeMembers, setActiveMembers] = useState<number | ''>('');

  // Executives
  const [executives, setExecutives] = useState<Executive[]>([
    { id: '1', full_name: '', position: 'president', custom_position: '', email: '' }
  ]);

  // Outreach Channels
  const [selectedChannels, setSelectedChannels] = useState<Set<OutreachChannelType>>(new Set());
  const [channelData, setChannelData] = useState<Record<OutreachChannelType, OutreachChannel>>({
    email_newsletter: { type: 'email_newsletter' },
    facebook_group: { type: 'facebook_group' },
    instagram: { type: 'instagram' },
    linkedin_group: { type: 'linkedin_group' },
    chapter_website: { type: 'chapter_website' },
    alumni_database: { type: 'alumni_database' },
    other: { type: 'other' },
  });

  // Alumni List
  const [alumniFile, setAlumniFile] = useState<File | null>(null);
  const [alumniFileUrl, setAlumniFileUrl] = useState('');
  const [noAlumniList, setNoAlumniList] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Demo
  const [scheduledDemo, setScheduledDemo] = useState('');
  const [bookingLink, setBookingLink] = useState(DEFAULT_BOOKING_LINK);

  // Instagram Launch
  const [igHandle, setIgHandle] = useState('');
  const [igPhoto, setIgPhoto] = useState<File | null>(null);
  const [igPhotoUrl, setIgPhotoUrl] = useState('');
  const [igPhotoPreview, setIgPhotoPreview] = useState('');

  // Load draft from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && token) {
      const draft = localStorage.getItem(`onboarding_draft_${token}`);
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          if (parsed.university) setUniversity(parsed.university);
          if (parsed.fraternity) setFraternity(parsed.fraternity);
          if (parsed.chapterDesignation) setChapterDesignation(parsed.chapterDesignation);
          if (parsed.yearFounded) setYearFounded(parsed.yearFounded);
          if (parsed.estimatedAlumni) setEstimatedAlumni(parsed.estimatedAlumni);
          if (parsed.activeMembers) setActiveMembers(parsed.activeMembers);
          if (parsed.executives) setExecutives(parsed.executives);
          if (parsed.selectedChannels) setSelectedChannels(new Set(parsed.selectedChannels));
          if (parsed.channelData) setChannelData(parsed.channelData);
          if (parsed.noAlumniList) setNoAlumniList(parsed.noAlumniList);
          if (parsed.igHandle) setIgHandle(parsed.igHandle);
          if (parsed.currentSection) setCurrentSection(parsed.currentSection);
        } catch (e) {
          console.error('Failed to parse draft:', e);
        }
      }
    }
  }, [token]);

  // Save draft to localStorage
  const saveDraft = useCallback(() => {
    if (typeof window !== 'undefined' && token) {
      const draft = {
        university,
        fraternity,
        chapterDesignation,
        yearFounded,
        estimatedAlumni,
        activeMembers,
        executives,
        selectedChannels: Array.from(selectedChannels),
        channelData,
        noAlumniList,
        igHandle,
        currentSection,
      };
      localStorage.setItem(`onboarding_draft_${token}`, JSON.stringify(draft));
    }
  }, [token, university, fraternity, chapterDesignation, yearFounded, estimatedAlumni, activeMembers,
      executives, selectedChannels, channelData, noAlumniList, igHandle, currentSection]);

  // Auto-save draft on changes
  useEffect(() => {
    const timeout = setTimeout(saveDraft, 500);
    return () => clearTimeout(timeout);
  }, [saveDraft]);

  // Validate token and fetch settings on mount
  useEffect(() => {
    async function validateToken() {
      try {
        const response = await fetch(`/api/onboarding/token?token=${token}`);
        const result = await response.json();
        
        if (result.error) {
          setError(result.error.message);
          setLoading(false);
          return;
        }

        setChapterInfo(result.data);
        
        // Pre-populate known info
        if (result.data.school) {
          setUniversity(result.data.school);
          setUniversitySearch(result.data.school);
        }
        if (result.data.fraternity) {
          setFraternity(result.data.fraternity);
          setFraternitySearch(result.data.fraternity);
        }

        if (result.data.already_submitted) {
          setSubmitted(true);
        }
      } catch {
        setError('Failed to validate link. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    async function fetchBookingLink() {
      try {
        const response = await fetch('/api/settings?key=booking_link');
        const result = await response.json();
        if (result.data?.value) {
          setBookingLink(result.data.value);
        }
      } catch (err) {
        console.error('Failed to fetch booking link:', err);
      }
    }
    
    validateToken();
    fetchBookingLink();
  }, [token]);

  // Filter universities for autocomplete
  const filteredUniversities = UNIVERSITIES.filter(u => 
    u.toLowerCase().includes(universitySearch.toLowerCase())
  ).slice(0, 8);

  // Filter fraternities for autocomplete
  const filteredOrganizations = GREEK_ORGANIZATIONS.filter(o => 
    o.toLowerCase().includes(fraternitySearch.toLowerCase())
  ).slice(0, 8);

  // Executive handlers
  const addExecutive = () => {
    setExecutives([
      ...executives,
      { id: Date.now().toString(), full_name: '', position: 'president', custom_position: '', email: '' }
    ]);
  };

  const removeExecutive = (id: string) => {
    if (executives.length > 1) {
      setExecutives(executives.filter(e => e.id !== id));
    }
  };

  const updateExecutive = (id: string, field: keyof Executive, value: string) => {
    setExecutives(executives.map(e => 
      e.id === id ? { ...e, [field]: value } : e
    ));
  };

  // Channel handlers
  const toggleChannel = (type: OutreachChannelType) => {
    const newSelected = new Set(selectedChannels);
    if (newSelected.has(type)) {
      newSelected.delete(type);
    } else {
      newSelected.add(type);
    }
    setSelectedChannels(newSelected);
  };

  const updateChannelData = (type: OutreachChannelType, field: string, value: string | number) => {
    setChannelData({
      ...channelData,
      [type]: { ...channelData[type], [field]: value },
    });
  };

  // File upload handler
  const handleFileUpload = async (file: File, type: 'alumni' | 'instagram') => {
    if (!file) return;

    setUploadingFile(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      
      if (result.error) {
        setValidationErrors({ ...validationErrors, [type]: result.error.message });
        return;
      }

      if (type === 'alumni') {
        setAlumniFile(file);
        setAlumniFileUrl(result.data.url);
      } else {
        setIgPhoto(file);
        setIgPhotoUrl(result.data.url);
        setIgPhotoPreview(URL.createObjectURL(file));
      }
    } catch {
      setValidationErrors({ ...validationErrors, [type]: 'Failed to upload file' });
    } finally {
      setUploadingFile(false);
    }
  };

  // Validation
  const validateSection = (section: number): boolean => {
    const errors: ValidationErrors = {};

    switch (section) {
      case 1:
        if (!university.trim()) errors.university = 'University is required';
        if (!fraternity.trim()) errors.fraternity = 'Fraternity/Sorority is required';
        if (!estimatedAlumni) errors.estimatedAlumni = 'Estimated alumni count is required';
        if (!activeMembers) errors.activeMembers = 'Active member count is required';
        break;
      case 2:
        executives.forEach((exec, index) => {
          if (!exec.full_name.trim()) errors[`exec_${index}_name`] = 'Name is required';
          if (!exec.email.trim()) errors[`exec_${index}_email`] = 'Email is required';
          else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(exec.email)) {
            errors[`exec_${index}_email`] = 'Invalid email format';
          } else if (exec.email.toLowerCase().endsWith('.edu')) {
            errors[`exec_${index}_email`] = 'Please use a personal email (no .edu addresses)';
          }
          if (exec.position === 'other' && !exec.custom_position.trim()) {
            errors[`exec_${index}_position`] = 'Please specify position';
          }
        });
        break;
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Navigation
  const goToSection = (section: number) => {
    if (section < currentSection || validateSection(currentSection)) {
      setCurrentSection(section);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // Scroll to first error
      const firstErrorKey = Object.keys(validationErrors)[0];
      const errorElement = document.querySelector(`[data-field="${firstErrorKey}"]`);
      if (errorElement) {
        errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  const nextSection = () => {
    if (currentSection < 7) {
      goToSection(currentSection + 1);
    }
  };

  const prevSection = () => {
    if (currentSection > 1) {
      goToSection(currentSection - 1);
    }
  };

  // Submit form
  const handleSubmit = async () => {
    // Validate all required sections
    if (!validateSection(1) || !validateSection(2)) {
      setCurrentSection(1);
      return;
    }

    setSubmitting(true);

    const formData: OnboardingFormData = {
      university,
      fraternity,
      chapter_designation: chapterDesignation || undefined,
      year_founded: yearFounded ? Number(yearFounded) : undefined,
      estimated_alumni: Number(estimatedAlumni),
      active_members: Number(activeMembers),
      executives: executives.map(e => ({
        full_name: e.full_name,
        position: e.position,
        custom_position: e.position === 'other' ? e.custom_position : undefined,
        email: e.email,
      })),
      outreach_channels: Array.from(selectedChannels).map(type => channelData[type]),
      alumni_list_file_name: alumniFile?.name,
      alumni_list_file_url: alumniFileUrl || undefined,
      no_alumni_list: noAlumniList,
      scheduled_demo_time: scheduledDemo || undefined,
      instagram_handle: igHandle || undefined,
      instagram_photo_url: igPhotoUrl || undefined,
    };

    try {
      const response = await fetch('/api/onboarding/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, formData }),
      });

      const result = await response.json();

      if (result.error) {
        setError(result.error.message);
        setSubmitting(false);
        return;
      }

      // Clear draft
      if (typeof window !== 'undefined') {
        localStorage.removeItem(`onboarding_draft_${token}`);
      }

      setSubmitted(true);
    } catch {
      setError('Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="onboarding-loading">
        <Loader2 className="animate-spin" size={48} />
        <p>Loading your onboarding form...</p>
      </div>
    );
  }

  // Error state
  if (error && !chapterInfo) {
    return (
      <div className="onboarding-error">
        <AlertCircle size={48} />
        <h2>Invalid Link</h2>
        <p>{error}</p>
        <p className="text-sm">Please contact your customer success manager for a valid link.</p>
      </div>
    );
  }

  // Already submitted state
  if (submitted) {
    return (
      <div className="onboarding-success">
        <div className="success-icon">
          <CheckCircle2 size={64} />
        </div>
        <h1>Onboarding Submitted!</h1>
        <p>Thank you for completing your chapter onboarding information.</p>
        <p className="text-secondary">Your customer success manager will be in touch shortly!</p>
        
        <div className="success-summary">
          <h3>Summary</h3>
          <div className="summary-item">
            <strong>Chapter:</strong> {chapterInfo?.chapter_name || fraternity}
          </div>
          <div className="summary-item">
            <strong>University:</strong> {university}
          </div>
          <div className="summary-item">
            <strong>Executives Added:</strong> {executives.length}
          </div>
          <div className="summary-item">
            <strong>Communication Channels:</strong> {selectedChannels.size}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding-page">
      {/* Header */}
      <header className="onboarding-header">
        <div className="onboarding-logo">
          <img src="/logos/logo-wordmark-navy.png" alt="Trailblaize" />
        </div>
        <h1>Chapter Onboarding</h1>
        {chapterInfo?.chapter_name && (
          <p className="chapter-name">{chapterInfo.chapter_name}</p>
        )}
      </header>

      {/* Progress Stepper */}
      <nav className="onboarding-stepper">
        {SECTIONS.map((section, index) => {
          const Icon = section.icon;
          const isActive = section.id === currentSection;
          const isCompleted = section.id < currentSection;
          
          return (
            <React.Fragment key={section.id}>
              <button
                className={`step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
                onClick={() => goToSection(section.id)}
              >
                <div className="step-icon">
                  {isCompleted ? <Check size={16} /> : <Icon size={16} />}
                </div>
                <span className="step-title">{section.title}</span>
              </button>
              {index < SECTIONS.length - 1 && <div className="step-connector" />}
            </React.Fragment>
          );
        })}
      </nav>

      {/* Form Content */}
      <main className="onboarding-content">
        {/* Section 1: Chapter Information */}
        {currentSection === 1 && (
          <section className="form-section">
            <h2><Building2 size={24} /> Chapter Information</h2>
            <p className="section-description">Tell us about your chapter</p>

            <div className="form-group" data-field="university">
              <label>University *</label>
              <div className="autocomplete-wrapper">
                <input
                  type="text"
                  value={universitySearch}
                  onChange={(e) => {
                    setUniversitySearch(e.target.value);
                    setUniversity(e.target.value); // Also set university for validation
                    setShowUniversitySuggestions(true);
                  }}
                  onFocus={() => setShowUniversitySuggestions(true)}
                  onBlur={() => setTimeout(() => setShowUniversitySuggestions(false), 200)}
                  placeholder="Search for your university..."
                  className={validationErrors.university ? 'error' : ''}
                />
                {showUniversitySuggestions && filteredUniversities.length > 0 && (
                  <ul className="autocomplete-list">
                    {filteredUniversities.map(u => (
                      <li 
                        key={u}
                        onClick={() => {
                          setUniversity(u);
                          setUniversitySearch(u);
                          setShowUniversitySuggestions(false);
                        }}
                      >
                        {u}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {validationErrors.university && (
                <span className="error-message">{validationErrors.university}</span>
              )}
            </div>

            <div className="form-group" data-field="fraternity">
              <label>Fraternity/Sorority *</label>
              <div className="autocomplete-wrapper">
                <input
                  type="text"
                  value={fraternitySearch}
                  onChange={(e) => {
                    setFraternitySearch(e.target.value);
                    setFraternity(e.target.value); // Also set fraternity for validation
                    setShowFraternitySuggestions(true);
                  }}
                  onFocus={() => setShowFraternitySuggestions(true)}
                  onBlur={() => setTimeout(() => setShowFraternitySuggestions(false), 200)}
                  placeholder="Search for your organization..."
                  className={validationErrors.fraternity ? 'error' : ''}
                />
                {showFraternitySuggestions && filteredOrganizations.length > 0 && (
                  <ul className="autocomplete-list">
                    {filteredOrganizations.map(o => (
                      <li 
                        key={o}
                        onClick={() => {
                          setFraternity(o);
                          setFraternitySearch(o);
                          setShowFraternitySuggestions(false);
                        }}
                      >
                        {o}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {validationErrors.fraternity && (
                <span className="error-message">{validationErrors.fraternity}</span>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Chapter Designation</label>
                <input
                  type="text"
                  value={chapterDesignation}
                  onChange={(e) => setChapterDesignation(e.target.value)}
                  placeholder="e.g., Alpha Beta, Gamma Mu"
                />
              </div>
              <div className="form-group">
                <label>Year Founded</label>
                <input
                  type="number"
                  value={yearFounded}
                  onChange={(e) => setYearFounded(e.target.value ? parseInt(e.target.value) : '')}
                  placeholder="e.g., 1985"
                  min={1800}
                  max={new Date().getFullYear()}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group" data-field="estimatedAlumni">
                <label>Estimated Total Living Alumni *</label>
                <input
                  type="number"
                  value={estimatedAlumni}
                  onChange={(e) => setEstimatedAlumni(e.target.value ? parseInt(e.target.value) : '')}
                  placeholder="e.g., 500"
                  min={0}
                  className={validationErrors.estimatedAlumni ? 'error' : ''}
                />
                <span className="helper-text">Approximate is fine</span>
                {validationErrors.estimatedAlumni && (
                  <span className="error-message">{validationErrors.estimatedAlumni}</span>
                )}
              </div>
              <div className="form-group" data-field="activeMembers">
                <label># of Active Members *</label>
                <input
                  type="number"
                  value={activeMembers}
                  onChange={(e) => setActiveMembers(e.target.value ? parseInt(e.target.value) : '')}
                  placeholder="e.g., 80"
                  min={0}
                  className={validationErrors.activeMembers ? 'error' : ''}
                />
                <span className="helper-text">Current chapter size</span>
                {validationErrors.activeMembers && (
                  <span className="error-message">{validationErrors.activeMembers}</span>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Section 2: Executive Board */}
        {currentSection === 2 && (
          <section className="form-section">
            <h2><Users size={24} /> Executive Board</h2>
            <p className="section-description">Add your chapter&apos;s executive team</p>

            <div className="executives-list">
              {executives.map((exec, index) => (
                <div key={exec.id} className="executive-card">
                  <div className="executive-header">
                    <span className="executive-number">Executive {index + 1}</span>
                    {executives.length > 1 && (
                      <button
                        type="button"
                        className="remove-btn"
                        onClick={() => removeExecutive(exec.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  
                  <div className="form-group" data-field={`exec_${index}_name`}>
                    <label>Full Name *</label>
                    <input
                      type="text"
                      value={exec.full_name}
                      onChange={(e) => updateExecutive(exec.id, 'full_name', e.target.value)}
                      placeholder="John Smith"
                      className={validationErrors[`exec_${index}_name`] ? 'error' : ''}
                    />
                    {validationErrors[`exec_${index}_name`] && (
                      <span className="error-message">{validationErrors[`exec_${index}_name`]}</span>
                    )}
                  </div>

                  <div className="form-group" data-field={`exec_${index}_position`}>
                    <label>Position *</label>
                    <select
                      value={exec.position}
                      onChange={(e) => updateExecutive(exec.id, 'position', e.target.value)}
                    >
                      {Object.entries(EXECUTIVE_POSITION_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                    {exec.position === 'other' && (
                      <input
                        type="text"
                        value={exec.custom_position}
                        onChange={(e) => updateExecutive(exec.id, 'custom_position', e.target.value)}
                        placeholder="Specify position..."
                        className={`mt-2 ${validationErrors[`exec_${index}_position`] ? 'error' : ''}`}
                      />
                    )}
                    {validationErrors[`exec_${index}_position`] && (
                      <span className="error-message">{validationErrors[`exec_${index}_position`]}</span>
                    )}
                  </div>

                  <div className="form-group" data-field={`exec_${index}_email`}>
                    <label>Personal Email *</label>
                    <input
                      type="email"
                      value={exec.email}
                      onChange={(e) => updateExecutive(exec.id, 'email', e.target.value)}
                      placeholder="john@gmail.com"
                      className={validationErrors[`exec_${index}_email`] ? 'error' : ''}
                    />
                    <span className="helper-text">Use a personal email (no .edu) - graduates lose access to school emails</span>
                    {validationErrors[`exec_${index}_email`] && (
                      <span className="error-message">{validationErrors[`exec_${index}_email`]}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button type="button" className="add-btn" onClick={addExecutive}>
              <Plus size={18} />
              Add Another Executive
            </button>
          </section>
        )}

        {/* Section 3: Outreach Channels */}
        {currentSection === 3 && (
          <section className="form-section">
            <h2><Share2 size={24} /> Current Outreach Channels</h2>
            <p className="section-description">
              Select all channels you currently use to communicate with alumni. 
              This helps us maximize your reach.
            </p>

            <div className="channels-list">
              {(Object.keys(OUTREACH_CHANNEL_LABELS) as OutreachChannelType[]).map(type => (
                <div key={type} className={`channel-card ${selectedChannels.has(type) ? 'selected' : ''}`}>
                  <label className="channel-header">
                    <input
                      type="checkbox"
                      checked={selectedChannels.has(type)}
                      onChange={() => toggleChannel(type)}
                    />
                    <span className="checkmark">
                      {selectedChannels.has(type) && <Check size={14} />}
                    </span>
                    <span>{OUTREACH_CHANNEL_LABELS[type]}</span>
                  </label>

                  {selectedChannels.has(type) && (
                    <div className="channel-details">
                      {type === 'email_newsletter' && (
                        <>
                          <div className="form-group">
                            <label>How do you currently send updates?</label>
                            <select
                              value={channelData[type].email_platform || ''}
                              onChange={(e) => updateChannelData(type, 'email_platform', e.target.value)}
                            >
                              <option value="">Select method...</option>
                              {COMMUNICATION_METHODS.map(m => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                            </select>
                          </div>
                          <div className="form-group">
                            <label>How many alumni do you reach?</label>
                            <input
                              type="number"
                              value={channelData[type].email_subscriber_count || ''}
                              onChange={(e) => updateChannelData(type, 'email_subscriber_count', parseInt(e.target.value) || 0)}
                              placeholder="e.g., 250"
                            />
                          </div>
                        </>
                      )}

                      {type === 'facebook_group' && (
                        <>
                          <div className="form-group">
                            <label>Who has access to the group?</label>
                            <select
                              value={channelData[type].facebook_url || ''}
                              onChange={(e) => updateChannelData(type, 'facebook_url', e.target.value)}
                            >
                              <option value="">Select access...</option>
                              <option value="alumni_only">Alumni only</option>
                              <option value="actives_have_access">An active member has access</option>
                              <option value="both">Both actives and alumni</option>
                            </select>
                          </div>
                          <div className="form-group">
                            <label>Member Count</label>
                            <input
                              type="number"
                              value={channelData[type].facebook_member_count || ''}
                              onChange={(e) => updateChannelData(type, 'facebook_member_count', parseInt(e.target.value) || 0)}
                              placeholder="e.g., 300"
                            />
                          </div>
                        </>
                      )}

                      {type === 'instagram' && (
                        <>
                          <div className="form-group">
                            <label>Handle</label>
                            <div className="input-prefix">
                              <span>@</span>
                              <input
                                type="text"
                                value={channelData[type].instagram_handle || ''}
                                onChange={(e) => updateChannelData(type, 'instagram_handle', e.target.value.replace('@', ''))}
                                placeholder="chaptername"
                              />
                            </div>
                          </div>
                          <div className="form-group">
                            <label>Follower Count</label>
                            <input
                              type="number"
                              value={channelData[type].instagram_follower_count || ''}
                              onChange={(e) => updateChannelData(type, 'instagram_follower_count', parseInt(e.target.value) || 0)}
                              placeholder="e.g., 500"
                            />
                          </div>
                        </>
                      )}

                      {type === 'linkedin_group' && (
                        <>
                          <div className="form-group">
                            <label>Group URL</label>
                            <input
                              type="url"
                              value={channelData[type].linkedin_url || ''}
                              onChange={(e) => updateChannelData(type, 'linkedin_url', e.target.value)}
                              placeholder="https://linkedin.com/groups/..."
                            />
                          </div>
                          <div className="form-group">
                            <label>Member Count</label>
                            <input
                              type="number"
                              value={channelData[type].linkedin_member_count || ''}
                              onChange={(e) => updateChannelData(type, 'linkedin_member_count', parseInt(e.target.value) || 0)}
                              placeholder="e.g., 150"
                            />
                          </div>
                        </>
                      )}

                      {type === 'chapter_website' && (
                        <div className="form-group">
                          <label>Website URL</label>
                          <input
                            type="url"
                            value={channelData[type].website_url || ''}
                            onChange={(e) => updateChannelData(type, 'website_url', e.target.value)}
                            placeholder="https://..."
                          />
                        </div>
                      )}

                      {type === 'other' && (
                        <div className="form-group">
                          <label>Description</label>
                          <textarea
                            value={channelData[type].description || ''}
                            onChange={(e) => updateChannelData(type, 'description', e.target.value)}
                            placeholder="Describe your other communication channel..."
                            rows={2}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Section 4: Alumni List */}
        {currentSection === 4 && (
          <section className="form-section">
            <h2><FileSpreadsheet size={24} /> Alumni List Upload</h2>
            <p className="section-description">
              Upload your alumni contact list. Ideal columns: Name, Email, Phone, Graduation Year, City.
              Don&apos;t worry if you don&apos;t have all of these.
            </p>

            {!noAlumniList && (
              <div 
                className={`file-upload-zone ${alumniFile ? 'has-file' : ''}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) handleFileUpload(file, 'alumni');
                }}
              >
                {alumniFile ? (
                  <div className="uploaded-file">
                    <FileSpreadsheet size={32} />
                    <div className="file-info">
                      <span className="file-name">{alumniFile.name}</span>
                      <span className="file-size">{(alumniFile.size / 1024).toFixed(1)} KB</span>
                    </div>
                    <button 
                      type="button" 
                      className="remove-file"
                      onClick={() => {
                        setAlumniFile(null);
                        setAlumniFileUrl('');
                      }}
                    >
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <>
                    {uploadingFile ? (
                      <Loader2 className="animate-spin" size={32} />
                    ) : (
                      <Upload size={32} />
                    )}
                    <p>Drag and drop your file here, or click to browse</p>
                    <span className="file-types">Accepts .csv, .xlsx, .xls (max 10MB)</span>
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file, 'alumni');
                      }}
                    />
                  </>
                )}
              </div>
            )}

            <label className="checkbox-option">
              <input
                type="checkbox"
                checked={noAlumniList}
                onChange={(e) => setNoAlumniList(e.target.checked)}
              />
              <span className="checkmark">
                {noAlumniList && <Check size={14} />}
              </span>
              <span>I don&apos;t have an alumni list ready yet</span>
            </label>
            {noAlumniList && (
              <p className="helper-text-block">
                No problem! We&apos;ll help you gather contacts during onboarding.
              </p>
            )}
          </section>
        )}

        {/* Section 5: Schedule Demo */}
        {currentSection === 5 && (
          <section className="form-section">
            <h2><Calendar size={24} /> Schedule Demo</h2>
            <p className="section-description">
              Let&apos;s get your executive team up to speed! Pick a time that works for your officers.
            </p>

            <div className="schedule-demo-card">
              <div className="schedule-demo-info">
                <div className="schedule-demo-icon">
                  <Calendar size={32} />
                </div>
                <div>
                  <h3>Book a Demo Call</h3>
                  <p>30-minute walkthrough with our team to get your chapter set up for success.</p>
                </div>
              </div>
              {bookingLink ? (
                <a 
                  href={bookingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="schedule-demo-btn"
                >
                  <Calendar size={18} />
                  Schedule Demo
                </a>
              ) : (
                <div className="schedule-demo-pending">
                  <p>Scheduling link coming soon! Your CS manager will reach out to schedule.</p>
                </div>
              )}
            </div>

            <p className="fallback-text">
              Can&apos;t find a time? Email us at{' '}
              <a href="mailto:ford@trailblaize.net">ford@trailblaize.net</a>
            </p>
          </section>
        )}

        {/* Section 6: Instagram Launch */}
        {currentSection === 6 && (
          <section className="form-section">
            <h2><Instagram size={24} /> Instagram Launch Post</h2>
            
            <div className="info-card">
              <h3>What is this?</h3>
              <p>
                We&apos;ll create a co-branded Instagram post to announce your chapter&apos;s 
                launch on Trailblaize. This drives early alumni sign-ups!
              </p>
              <div className="checklist-preview">
                <h4>What to prepare:</h4>
                <ul>
                  <li>
                    <Check size={14} />
                    <strong>A high-quality photo of your chapter house</strong>
                  </li>
                  <li>
                    <Check size={14} />
                    <strong>Your chapter&apos;s Instagram handle</strong> so we can tag you
                  </li>
                </ul>
              </div>
            </div>

            <div className="form-group">
              <label>Chapter Instagram Handle</label>
              <div className="input-prefix">
                <span>@</span>
                <input
                  type="text"
                  value={igHandle}
                  onChange={(e) => setIgHandle(e.target.value.replace('@', ''))}
                  placeholder="yourchapter"
                />
              </div>
            </div>

            <div className="form-group">
              <label>Upload House Photo (optional)</label>
              <div 
                className={`file-upload-zone image-upload ${igPhotoPreview ? 'has-file' : ''}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) handleFileUpload(file, 'instagram');
                }}
              >
                {igPhotoPreview ? (
                  <div className="uploaded-image">
                    <img src={igPhotoPreview} alt="Preview" />
                    <button 
                      type="button" 
                      className="remove-file"
                      onClick={() => {
                        setIgPhoto(null);
                        setIgPhotoUrl('');
                        setIgPhotoPreview('');
                      }}
                    >
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <>
                    {uploadingFile ? (
                      <Loader2 className="animate-spin" size={32} />
                    ) : (
                      <Upload size={32} />
                    )}
                    <p>Drag and drop a photo of your chapter house</p>
                    <span className="file-types">Accepts .jpg, .png (min 1080x1080)</span>
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file, 'instagram');
                      }}
                    />
                  </>
                )}
              </div>
              <span className="helper-text">
                You can also send the photo later - we&apos;ll share a draft with you before posting
              </span>
            </div>
          </section>
        )}

        {/* Section 7: Submit */}
        {currentSection === 7 && (
          <section className="form-section submit-section">
            <h2><Send size={24} /> Ready to Submit</h2>
            <p className="section-description">
              Review your information and submit when ready.
            </p>

            <div className="review-summary">
              <div className="review-item">
                <h4>Chapter</h4>
                <p>{fraternity} at {university}</p>
                {chapterDesignation && <p className="secondary">{chapterDesignation}</p>}
              </div>
              
              <div className="review-item">
                <h4>Executives</h4>
                <p>{executives.length} executive{executives.length !== 1 ? 's' : ''} added</p>
              </div>

              <div className="review-item">
                <h4>Communication Channels</h4>
                <p>{selectedChannels.size} channel{selectedChannels.size !== 1 ? 's' : ''} selected</p>
              </div>

              <div className="review-item">
                <h4>Alumni List</h4>
                <p>{alumniFile ? alumniFile.name : noAlumniList ? 'Will provide later' : 'Not uploaded'}</p>
              </div>

              <div className="review-item">
                <h4>Instagram</h4>
                <p>{igHandle ? `@${igHandle}` : 'Not provided'}</p>
              </div>
            </div>

            {error && (
              <div className="error-banner">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            <button
              type="button"
              className="submit-btn"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  Submitting...
                </>
              ) : (
                <>
                  <Send size={20} />
                  Submit Onboarding Information
                </>
              )}
            </button>

            <p className="legal-text">
              By submitting, you confirm you have authorization to share this 
              information on behalf of your chapter.
            </p>
          </section>
        )}

        {/* Navigation Buttons */}
        <div className="form-navigation">
          {currentSection > 1 && (
            <button type="button" className="nav-btn prev" onClick={prevSection}>
              <ChevronLeft size={20} />
              Previous
            </button>
          )}
          {currentSection < 7 && (
            <button type="button" className="nav-btn next" onClick={nextSection}>
              Next
              <ChevronRight size={20} />
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
