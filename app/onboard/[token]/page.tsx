'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { 
  Check, ChevronRight, ChevronLeft, Upload, X,
  AlertCircle, CheckCircle2, Building2, Share2, FileSpreadsheet,
  Send, Loader2, Calendar
} from 'lucide-react';
import {
  GREEK_ORGANIZATIONS,
  UNIVERSITIES,
  OnboardingFormData,
  OutreachChannelType,
  OUTREACH_CHANNEL_LABELS,
} from '@/lib/supabase';

// Default booking link fallback
const DEFAULT_BOOKING_LINK = 'https://calendly.com/owen-trailblaize/30min';

interface ValidationErrors {
  [key: string]: string;
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
  { id: 1, title: 'Outreach Channels', icon: Share2 },
  { id: 2, title: 'Alumni List', icon: FileSpreadsheet },
  { id: 3, title: 'Submit', icon: Send },
];

const COMMUNICATION_METHODS = ['Email', 'Physical Mail', 'Both Email and Mail'];

export default function OnboardingForm() {
  const params = useParams();
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

  // Booking link (shown on success screen)
  const [bookingLink, setBookingLink] = useState(DEFAULT_BOOKING_LINK);

  // Load draft from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && token) {
      const draft = localStorage.getItem(`onboarding_draft_${token}`);
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          if (parsed.university) setUniversity(parsed.university);
          if (parsed.fraternity) setFraternity(parsed.fraternity);
          if (parsed.selectedChannels) setSelectedChannels(new Set(parsed.selectedChannels));
          if (parsed.channelData) setChannelData(parsed.channelData);
          if (parsed.noAlumniList) setNoAlumniList(parsed.noAlumniList);
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
        selectedChannels: Array.from(selectedChannels),
        channelData,
        noAlumniList,
        currentSection,
      };
      localStorage.setItem(`onboarding_draft_${token}`, JSON.stringify(draft));
    }
  }, [token, university, fraternity, selectedChannels, channelData, noAlumniList, currentSection]);

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
  const handleFileUpload = async (file: File) => {
    if (!file) return;

    setUploadingFile(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'alumni');

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      
      if (result.error) {
        setValidationErrors(prev => ({ ...prev, alumni: result.error.message }));
        return;
      }

      setAlumniFile(file);
      setAlumniFileUrl(result.data.url);
    } catch {
      setValidationErrors(prev => ({ ...prev, alumni: 'Failed to upload file' }));
    } finally {
      setUploadingFile(false);
    }
  };

  // Validation
  const validateSection = (section: number): boolean => {
    const errors: ValidationErrors = {};

    switch (section) {
      case 2:
        // Alumni list: must either upload a file OR check "no list yet"
        if (!alumniFile && !noAlumniList) {
          errors.alumni = 'Please upload your alumni list or check the box if you don\'t have one yet';
        }
        break;
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Navigation
  const goToSection = (section: number) => {
    const isValid = section < currentSection || validateSection(currentSection);
    if (isValid) {
      setCurrentSection(section);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // Scroll to first error — use a short delay so state has updated
      setTimeout(() => {
        const errorElement = document.querySelector('[data-field]');
        if (errorElement) {
          errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
    }
  };

  const nextSection = () => {
    if (currentSection < 4) {
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
    if (!chapterInfo) {
      setError('Chapter information not loaded. Please refresh and try again.');
      return;
    }

    setSubmitting(true);

    const formData: Partial<OnboardingFormData> = {
      university,
      fraternity,
      outreach_channels: Array.from(selectedChannels).map(type => channelData[type]),
      alumni_list_file_name: alumniFile?.name,
      alumni_list_file_url: alumniFileUrl || undefined,
      no_alumni_list: noAlumniList,
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

  // Already submitted / success state
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
            <strong>Communication Channels:</strong> {selectedChannels.size}
          </div>
        </div>

        {/* Schedule a Call CTA */}
        <div className="schedule-call-card">
          <div className="schedule-call-icon">
            <Calendar size={32} />
          </div>
          <h3>Want to schedule a quick call with our team?</h3>
          <p>
            We&apos;d love to walk you through the platform and get your chapter set up for success.
          </p>
          <a
            href={bookingLink}
            target="_blank"
            rel="noopener noreferrer"
            className="schedule-call-btn"
          >
            <Calendar size={18} />
            Book a 30-Minute Call
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding-page">
      {/* Header */}
      <header className="onboarding-header">
        <div className="onboarding-logo">
          <img src="/logo.png" alt="Trailblaize" />
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

        {currentSection === 1 && (
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

        {/* Section 2: Alumni List */}
        {currentSection === 2 && (
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
                  if (file) handleFileUpload(file);
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
                        if (file) handleFileUpload(file);
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
            {validationErrors.alumni && (
              <p className="error-message" style={{ marginTop: '0.75rem', color: '#ef4444', fontSize: '0.875rem' }} data-field="alumni">
                {validationErrors.alumni}
              </p>
            )}
          </section>
        )}

        {/* Section 3: Submit */}
        {currentSection === 3 && (
          <section className="form-section submit-section">
            <h2><Send size={24} /> Ready to Submit</h2>
            <p className="section-description">
              Review your information and submit when ready.
            </p>

            <div className="review-summary">
              <div className="review-item">
                <h4>Chapter</h4>
                <p>{fraternity} at {university}</p>
              </div>

              <div className="review-item">
                <h4>Communication Channels</h4>
                <p>{selectedChannels.size} channel{selectedChannels.size !== 1 ? 's' : ''} selected</p>
              </div>

              <div className="review-item">
                <h4>Alumni List</h4>
                <p>{alumniFile ? alumniFile.name : noAlumniList ? 'Will provide later' : 'Not uploaded'}</p>
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
          {currentSection < SECTIONS.length && (
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
