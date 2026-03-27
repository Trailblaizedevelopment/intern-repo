'use client';

import React, { useState, useEffect } from 'react';
import { Upload, CheckCircle2, AlertCircle, Loader2, ArrowRight, Sparkles, Users, Zap, Globe } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client for direct uploads (bypasses API size limits)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export default function HomePage() {
  const [showApplication, setShowApplication] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  
  // Form state
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    linkedin: '',
    instagram: '',
    video: null as File | null,
    scenario1: null as File | null,
    scenario2: null as File | null,
    scenario3: null as File | null,
    confirm1: false,
    confirm2: false,
    confirm3: false,
    confirm4: false,
  });

  const [fileNames, setFileNames] = useState({
    video: '',
    scenario1: '',
    scenario2: '',
    scenario3: '',
  });

  // Track upload status per file field
  const [uploadStatus, setUploadStatus] = useState<Record<string, 'idle' | 'uploading' | 'success' | 'error'>>({
    video: 'idle',
    scenario1: 'idle',
    scenario2: 'idle',
    scenario3: 'idle',
  });

  // Store uploaded URLs
  const [uploadedUrls, setUploadedUrls] = useState<Record<string, string>>({
    video: '',
    scenario1: '',
    scenario2: '',
    scenario3: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [submitStatus, setSubmitStatus] = useState<'success' | 'error' | null>(null);
  const [validationError, setValidationError] = useState('');
  const [errorDetails, setErrorDetails] = useState('');

  // Mouse tracking for ambient effect
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({
        x: (e.clientX / window.innerWidth) * 100,
        y: (e.clientY / window.innerHeight) * 100,
      });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, fieldName: keyof typeof fileNames) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Store file locally and show name immediately
    setFormData(prev => ({ ...prev, [fieldName]: file }));
    setFileNames(prev => ({ ...prev, [fieldName]: file.name }));
    setUploadStatus(prev => ({ ...prev, [fieldName]: 'uploading' }));

    // Upload immediately for instant feedback
    try {
      const url = await uploadFile(file, 'applications');
      if (url) {
        setUploadedUrls(prev => ({ ...prev, [fieldName]: url }));
        setUploadStatus(prev => ({ ...prev, [fieldName]: 'success' }));
      } else {
        throw new Error('Upload failed - no URL returned');
      }
    } catch (error) {
      console.error(`Upload error for ${fieldName}:`, error);
      setUploadStatus(prev => ({ ...prev, [fieldName]: 'error' }));
      setErrorDetails(error instanceof Error ? error.message : 'Upload failed. Please check storage configuration.');
    }
  };

  // Upload a single file directly to Supabase Storage (no size limit)
  const uploadFile = async (file: File, folder: string): Promise<string | null> => {
    if (!supabase) {
      throw new Error('Storage not configured');
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const extension = file.name.split('.').pop() || 'bin';
    const fileName = `${folder}/${timestamp}-${randomStr}.${extension}`;

    // Upload directly to Supabase Storage
    const { data, error } = await supabase.storage
      .from('uploads')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('Upload error:', error);
      throw new Error(error.message);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('uploads')
      .getPublicUrl(fileName);

    return urlData?.publicUrl || null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');
    setSubmitStatus(null);

    // Validate required fields (files are optional)
    const showError = (msg: string) => {
      setValidationError(msg);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    if (!formData.fullName.trim()) {
      showError('Please enter your full name');
      return;
    }
    if (!formData.email.trim()) {
      showError('Please enter your email address');
      return;
    }
    if (!formData.phone.trim()) {
      showError('Please enter your phone number');
      return;
    }
    if (!formData.linkedin.trim()) {
      showError('Please enter your LinkedIn URL');
      return;
    }
    if (!formData.instagram.trim()) {
      showError('Please enter your Instagram handle');
      return;
    }
    if (!formData.confirm1 || !formData.confirm2 || !formData.confirm3 || !formData.confirm4) {
      showError('Please check all confirmation boxes');
      return;
    }

    setSubmitting(true);
    setUploadProgress('Submitting...');
    setErrorDetails('');

    try {
      // Use pre-uploaded URLs (files were uploaded immediately when selected)
      const videoUrl = uploadedUrls.video || '';
      const scenario1Url = uploadedUrls.scenario1 || '';
      const scenario2Url = uploadedUrls.scenario2 || '';
      const scenario3Url = uploadedUrls.scenario3 || '';

      // Check if any files were selected but failed to upload
      const hasFailedUploads = 
        (formData.video && uploadStatus.video === 'error') ||
        (formData.scenario1 && uploadStatus.scenario1 === 'error') ||
        (formData.scenario2 && uploadStatus.scenario2 === 'error') ||
        (formData.scenario3 && uploadStatus.scenario3 === 'error');

      // Check if any files are still uploading
      const stillUploading = 
        uploadStatus.video === 'uploading' ||
        uploadStatus.scenario1 === 'uploading' ||
        uploadStatus.scenario2 === 'uploading' ||
        uploadStatus.scenario3 === 'uploading';

      if (stillUploading) {
        throw new Error('Please wait for file uploads to complete before submitting.');
      }

      if (hasFailedUploads) {
        throw new Error('Some file uploads failed. Please remove or re-upload the failed files and try again.');
      }

      setUploadProgress('Submitting application...');

      // Build cover letter with file URLs if any were uploaded
      const challengeProof = [
        videoUrl ? `Video: ${videoUrl}` : '',
        scenario1Url ? `Scenario 1: ${scenario1Url}` : '',
        scenario2Url ? `Scenario 2: ${scenario2Url}` : '',
        scenario3Url ? `Scenario 3: ${scenario3Url}` : '',
      ].filter(Boolean).join('\n');

      // Submit application to CRM
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.fullName,
          email: formData.email,
          phone: formData.phone,
          position: 'growth_intern',
          linkedin_url: formData.linkedin,
          portfolio_url: videoUrl || null,
          experience: `Instagram: ${formData.instagram}`,
          cover_letter: challengeProof || null,
          why_trailblaize: 'Applied via careers page',
          source: 'website',
        }),
      });

      const result = await response.json();

      if (response.ok && !result.error) {
        console.log('=== SUBMISSION SUCCESS ===');
        setSubmitStatus('success');
        setFormData({
          fullName: '', email: '', phone: '', linkedin: '', instagram: '',
          video: null, scenario1: null, scenario2: null, scenario3: null,
          confirm1: false, confirm2: false, confirm3: false, confirm4: false,
        });
        setFileNames({ video: '', scenario1: '', scenario2: '', scenario3: '' });
        setUploadStatus({ video: 'idle', scenario1: 'idle', scenario2: 'idle', scenario3: 'idle' });
        setUploadedUrls({ video: '', scenario1: '', scenario2: '', scenario3: '' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        console.error('=== SUBMISSION FAILED ===', result.error);
        throw new Error(result.error?.message || 'Submission failed - check database table exists');
      }
    } catch (error) {
      console.error('=== SUBMISSION ERROR ===', error);
      setSubmitStatus('error');
      setErrorDetails(error instanceof Error ? error.message : 'Unknown error occurred');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
      setUploadProgress('');
    }
  };

  const FileUploadBox = ({ id, fieldName, label, accept, required = false }: {
    id: string;
    fieldName: keyof typeof fileNames;
    label: string;
    accept: string;
    icon?: React.ComponentType<{ className?: string }>;
    required?: boolean;
  }) => {
    const status = uploadStatus[fieldName];
    const isUploading = status === 'uploading';
    const hasFile = fileNames[fieldName] && status === 'success';
    const hasError = status === 'error';
    
    return (
      <div className="landing-upload-compact">
        <input
          type="file"
          id={id}
          accept={accept}
          onChange={(e) => handleFileChange(e, fieldName)}
          className="landing-file-input"
          required={required}
          disabled={isUploading}
        />
        <label 
          htmlFor={id} 
          className={`landing-upload-btn ${hasFile ? 'success' : ''} ${hasError ? 'error' : ''}`}
          style={isUploading ? { pointerEvents: 'none', opacity: 0.7 } : {}}
        >
          {isUploading ? (
            <>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              <span>Uploading...</span>
            </>
          ) : hasFile ? (
            <>
              <CheckCircle2 size={14} />
              <span>{fileNames[fieldName].length > 25 ? fileNames[fieldName].slice(0, 22) + '...' : fileNames[fieldName]}</span>
            </>
          ) : hasError ? (
            <>
              <AlertCircle size={14} />
              <span>Failed - retry</span>
            </>
          ) : (
            <>
              <Upload size={14} />
              <span>{label}</span>
            </>
          )}
        </label>
      </div>
    );
  };

  if (showApplication) {
    return (
      <div className="landing-app">
        {/* Application Header */}
        <header className="landing-app-header">
          <div className="landing-header-content">
            <button onClick={() => setShowApplication(false)} className="landing-back-btn">
              ← Back
            </button>
            <a href="https://trailblaize.net" className="landing-logo">
              <img src="/logos/logo-wordmark-navy.png" alt="Trailblaize" className="landing-logo-img landing-logo-img--light" />
            </a>
            <div style={{ width: '80px' }} />
          </div>
        </header>

        {/* Application Hero */}
        <section className="landing-app-hero">
          <div className="landing-app-hero-content">
            <span className="landing-badge">
              <Sparkles size={14} />
              5 Positions Available
            </span>
            <h1>Join the<br />Trailblaize Team</h1>
            <p>We&apos;re looking for exceptional individuals to help us revolutionize alumni engagement.</p>
          </div>
        </section>

        {/* Application Form */}
        <div className="landing-form-container">
          {submitStatus === 'success' && (
            <div className="landing-status-message success">
              <CheckCircle2 className="landing-status-icon" />
              <div>
                <strong>Application Submitted Successfully!</strong>
                <p>Thank you for applying! We&apos;ll review your application and contact selected candidates within 5 business days.</p>
              </div>
            </div>
          )}

          {submitStatus === 'error' && (
            <div className="landing-status-message error">
              <AlertCircle className="landing-status-icon" />
              <div>
                <strong>Submission Error</strong>
                <p>{errorDetails || 'There was an error. Please try again or email directly to owen@trailblaize.net'}</p>
              </div>
            </div>
          )}

          {validationError && (
            <div className="landing-status-message error">
              <AlertCircle className="landing-status-icon" />
              <div>
                <strong>Missing Information</strong>
                <p>{validationError}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* About */}
            <div className="landing-form-section intro">
              <h3>About This Opportunity</h3>
              <p>
                Trailblaize is revolutionizing how organizations connect with their communities and grow their networks. 
                We&apos;re building something special, and we need driven, resourceful individuals who thrive in high-energy 
                environments and aren&apos;t afraid to pick up the phone.
              </p>
              <p style={{ marginTop: '1rem' }}><strong>What We&apos;re Looking For:</strong></p>
              <p>
                We&apos;re hiring a select group of interns (<span className="landing-emphasis">5 positions from 50+ applicants</span>) 
                to join our growth team. You&apos;ll be working on two critical initiatives:
              </p>
              <ol>
                <li><strong>Alumni Engagement</strong> - Connecting with communities through personalized outreach</li>
                <li><strong>Business Development</strong> - Generating new opportunities and building relationships</li>
              </ol>
              <p style={{ marginTop: '1rem' }}>
                This isn&apos;t your typical internship. We reward performance, initiative, and results. If you&apos;re someone 
                who loves the challenge of turning &quot;no&quot; into &quot;yes&quot; and building genuine connections, keep reading.
              </p>
            </div>

            {/* Section 1 */}
            <div className="landing-form-section">
              <h2>Section 1: Basic Information</h2>
              <div className="landing-form-group">
                <label htmlFor="fullName">Full Name *</label>
                <input type="text" id="fullName" name="fullName" value={formData.fullName} onChange={handleInputChange} required />
              </div>
              <div className="landing-form-group">
                <label htmlFor="email">Email Address *</label>
                <input type="email" id="email" name="email" value={formData.email} onChange={handleInputChange} placeholder="your@email.com" required />
              </div>
              <div className="landing-form-group">
                <label htmlFor="phone">Phone Number *</label>
                <input type="tel" id="phone" name="phone" value={formData.phone} onChange={handleInputChange} required />
              </div>
            </div>

            {/* Section 2 */}
            <div className="landing-form-section">
              <h2>Section 2: Sales Challenge</h2>
              <p>
                This is where we see what you&apos;re made of. Complete <span className="landing-emphasis">ALL THREE calls/texts</span> and submit proof.
              </p>
              <div className="landing-important">
                <strong>Important Notes:</strong>
                <ul>
                  <li>You can call or text these numbers</li>
                  <li>Be professional, creative, and persistent</li>
                  <li>If they say no, <strong>ask for a referral</strong></li>
                  <li>Screenshot or record your interactions as proof</li>
                </ul>
              </div>

              {/* Scenario 1 */}
              <div className="landing-scenario">
                <h3>Scenario 1: The Charitable Heart</h3>
                <div className="landing-contact-box">Contact: Adam Perez · 720-557-2438</div>
                <p><strong>Your Role:</strong> Fundraiser for a charity of your choice</p>
                <div className="landing-objectives">
                  <p><strong>Primary:</strong> Get Adam to commit to a $10 donation</p>
                  <p><strong>Backup:</strong> Ask for a referral to someone who might support the cause</p>
                </div>
                <FileUploadBox id="scenario1Upload" fieldName="scenario1" label="Upload proof" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm,.jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.webm" />
              </div>

              {/* Scenario 2 */}
              <div className="landing-scenario">
                <h3>Scenario 2: The Software Sale</h3>
                <div className="landing-contact-box">Contact: Ford Hudson · 601-832-6655</div>
                <p><strong>Your Role:</strong> Owner of a software company (you choose what it does)</p>
                <div className="landing-objectives">
                  <p><strong>Primary:</strong> Book a meeting with Ford to discuss your software</p>
                  <p><strong>Backup:</strong> Get a referral to someone who handles software decisions</p>
                </div>
                <FileUploadBox id="scenario2Upload" fieldName="scenario2" label="Upload proof" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm,.jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.webm" />
              </div>

              {/* Scenario 3 */}
              <div className="landing-scenario">
                <h3>Scenario 3: The Product Pitch</h3>
                <div className="landing-contact-box">Contact: Anonymous · 601-826-3085</div>
                <p><strong>Your Role:</strong> Selling a product in the $25-50 range (your choice)</p>
                <div className="landing-objectives">
                  <p><strong>Primary:</strong> Get them to commit to purchasing the product</p>
                  <p><strong>Backup:</strong> Ask for a referral to someone who might need it</p>
                </div>
                <FileUploadBox id="scenario3Upload" fieldName="scenario3" label="Upload proof" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm,.jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.webm" />
              </div>
            </div>

            {/* Section 3 */}
            <div className="landing-form-section">
              <h2>Section 3: Video Challenge (25 Seconds)</h2>
              <div className="landing-video-challenge">
                <h3>The $100 Million Question</h3>
                <p>
                  Imagine this scenario: You have exactly 25 seconds to describe yourself to someone who cannot see you. 
                  They can only hear your voice. After listening to you, they&apos;ll spend a week observing 100 different 
                  people. At the end, they need to identify YOU based solely on what you told them.
                </p>
                <p className="landing-stakes">
                  The stakes? If they pick you correctly, you win $100 million. If they pick anyone else, you walk away with nothing.
                </p>
              </div>
              <p>
                <strong>Your Task:</strong><br />
                Record a 25-second video describing yourself. Tell us <span className="landing-emphasis">WHO you are</span>. 
                What traits make you uniquely identifiable?
              </p>
              <FileUploadBox id="videoUpload" fieldName="video" label="Upload video" accept="video/mp4,video/quicktime,video/webm,video/mov,.mp4,.mov,.webm,.avi" />
            </div>

            {/* Section 4 */}
            <div className="landing-form-section">
              <h2>Section 4: Final Details</h2>
              <div className="landing-form-group">
                <label htmlFor="linkedin">LinkedIn Profile URL *</label>
                <input type="url" id="linkedin" name="linkedin" value={formData.linkedin} onChange={handleInputChange} placeholder="https://linkedin.com/in/yourprofile" required />
              </div>
              <div className="landing-form-group">
                <label htmlFor="instagram">Instagram Handle *</label>
                <input type="text" id="instagram" name="instagram" value={formData.instagram} onChange={handleInputChange} placeholder="@yourhandle" required />
              </div>

              <div className="landing-checkbox-group">
                <h3>Confirmation</h3>
                <p>By submitting this form, I confirm that:</p>
                {[
                  { id: 'confirm1', label: 'I completed all three sales scenarios' },
                  { id: 'confirm2', label: 'All information provided is accurate' },
                  { id: 'confirm3', label: 'I understand this is a performance-based opportunity' },
                  { id: 'confirm4', label: "I'm ready to start immediately if selected" },
                ].map(({ id, label }) => (
                  <div key={id} className="landing-checkbox-item">
                    <input type="checkbox" id={id} name={id} checked={formData[id as keyof typeof formData] as boolean} onChange={handleInputChange} required />
                    <label htmlFor={id}>{label}</label>
                  </div>
                ))}
              </div>
            </div>

            <button type="submit" className="landing-submit-button" disabled={submitting}>
              {submitting ? (
                <>{uploadProgress || 'Submitting...'}<Loader2 className="landing-spinner" /></>
              ) : (
                <>Submit Application<ArrowRight size={20} /></>
              )}
            </button>
          </form>

          {/* What Happens Next */}
          <div className="landing-next-steps">
            <h2>What Happens Next?</h2>
            <p>We&apos;ll review all applications and select 5 candidates who demonstrate:</p>
            <ul>
              <li><strong>Initiative</strong> - You actually completed the challenges</li>
              <li><strong>Creativity</strong> - Your approach was thoughtful and unique</li>
              <li><strong>Persistence</strong> - You asked for referrals when faced with rejection</li>
              <li><strong>Authenticity</strong> - Your 25-second video showed us the real you</li>
            </ul>
            <p style={{ marginTop: '1.5rem' }}>
              <span className="landing-emphasis">Selected candidates will be contacted within 5 business days.</span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <footer className="landing-footer">
          <p>© 2025 Trailblaize, Inc. · <a href="mailto:support@trailblaize.net">support@trailblaize.net</a></p>
        </footer>
      </div>
    );
  }

  // Main Landing Page
  return (
    <div className="landing-page">
      {/* Animated Background */}
      <div 
        className="landing-bg-gradient"
        style={{
          '--mouse-x': `${mousePosition.x}%`,
          '--mouse-y': `${mousePosition.y}%`,
        } as React.CSSProperties}
      />
      <div className="landing-bg-grid" />
      <div className="landing-bg-noise" />

      {/* Floating Elements */}
      <div className="landing-floating-elements">
        <div className="landing-float-1" />
        <div className="landing-float-2" />
        <div className="landing-float-3" />
      </div>

      {/* Header */}
      <header className="landing-header">
        <a href="https://trailblaize.net" className="landing-logo">
          <img src="/logos/logo-wordmark-white.png" alt="Trailblaize" className="landing-logo-img" />
        </a>
        <div className="landing-header-links">
          <a href="https://trailblaize.net" className="landing-header-link">About</a>
          <a href="mailto:support@trailblaize.net" className="landing-header-link">Contact</a>
        </div>
      </header>

      {/* Hero Content */}
      <main className="landing-main">
        <div className="landing-hero">
          {/* Eyebrow */}
          <div className="landing-eyebrow">
            <span className="landing-eyebrow-dot" />
            <span>Now Hiring — Limited Positions</span>
          </div>

          {/* Main Title */}
          <h1 className="landing-title">
            Build the Future<br />
            <span className="landing-title-accent">of Alumni Networks</span>
          </h1>

          {/* Description */}
          <p className="landing-description">
            Trailblaize is revolutionizing how organizations connect with their communities. 
            Whether you&apos;re joining our team or managing your organization, start your journey here.
          </p>

          {/* CTA Buttons */}
          <div className="landing-cta-container">
            <button 
              onClick={() => setShowApplication(true)} 
              className="landing-cta-primary"
            >
              <span className="landing-cta-content">
                <Users size={20} />
                <span>Apply to Join</span>
              </span>
              <ArrowRight size={18} className="landing-cta-arrow" />
            </button>

            <a 
              href="/workspace" 
              className="landing-cta-secondary"
            >
              <span className="landing-cta-content">
                <Zap size={20} />
                <span>Sign In</span>
              </span>
              <ArrowRight size={18} className="landing-cta-arrow" />
            </a>
          </div>

          {/* Features */}
          <div className="landing-features">
            <div className="landing-feature">
              <div className="landing-feature-icon">
                <Globe size={18} />
              </div>
              <span>5,500+ Users</span>
            </div>
            <div className="landing-feature-divider" />
            <div className="landing-feature">
              <div className="landing-feature-icon">
                <Users size={18} />
              </div>
              <span>5 Schools</span>
            </div>
            <div className="landing-feature-divider" />
            <div className="landing-feature">
              <div className="landing-feature-icon">
                <Sparkles size={18} />
              </div>
              <span>Growing Fast</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="landing-page-footer">
        <div className="landing-footer-content">
          <p>© 2025 Trailblaize, Inc.</p>
          <div className="landing-footer-links">
            <a href="https://trailblaize.net">Website</a>
            <a href="mailto:support@trailblaize.net">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
