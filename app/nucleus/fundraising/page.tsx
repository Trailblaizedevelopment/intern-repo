'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Network, Plus, Search, Filter, X, Trash2, Edit2, Phone, Mail, Linkedin, Calendar, Clock, Upload, FileText, Image, CheckCircle, AlertCircle, ChevronDown, ChevronUp, Loader2, LayoutDashboard } from 'lucide-react';
import Link from 'next/link';
import { supabase, NetworkContact, Employee } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import ConfirmModal from '@/components/ConfirmModal';
import ModalOverlay from '@/components/ModalOverlay';
import { SkeletonTable } from '@/components/Skeleton';

// Parsed contact type for bulk upload preview
interface ParsedContact {
  name: string;
  title?: string;
  organization?: string;
  phone?: string;
  email?: string;
  linkedin?: string;
  notes?: string;
  valid: boolean;
  error?: string;
}

// Email type for contact email history
interface ContactEmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  fromEmail: string;
  to?: string;
  date: string;
  snippet: string;
  body?: string;
  isUnread: boolean;
}

// Google status type
interface GoogleStatus {
  connected: boolean;
  isExpired: boolean;
  scopes: string[];
  hasCalendar: boolean;
  hasGmail: boolean;
}

export default function FundraisingModule() {
  const { user } = useAuth();
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
  const [contacts, setContacts] = useState<NetworkContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingContact, setEditingContact] = useState<NetworkContact | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: string | null }>({ show: false, id: null });
  
  // Google integration state
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus | null>(null);
  const [expandedEmailRow, setExpandedEmailRow] = useState<string | null>(null);
  const [contactEmails, setContactEmails] = useState<Record<string, ContactEmailMessage[]>>({});
  const [loadingEmails, setLoadingEmails] = useState<string | null>(null);
  
  // Bulk upload state
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkUploadTab, setBulkUploadTab] = useState<'text' | 'image'>('text');
  const [bulkText, setBulkText] = useState('');
  const [parsedContacts, setParsedContacts] = useState<ParsedContact[]>([]);
  const [bulkDefaults, setBulkDefaults] = useState({
    contact_type: 'other' as NetworkContact['contact_type'],
    priority: 'warm' as NetworkContact['priority'],
    stage: 'identified' as NetworkContact['stage'],
  });
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [parsingImage, setParsingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
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

  // Fetch current employee
  const fetchEmployee = useCallback(async () => {
    if (!supabase || !user) return;

    const { data } = await supabase
      .from('employees')
      .select('*')
      .eq('email', user.email)
      .single();

    if (data) {
      setCurrentEmployee(data);
    }
  }, [user]);

  // Check Google connection status
  const checkGoogleStatus = useCallback(async () => {
    if (!currentEmployee?.id) return;
    
    try {
      const response = await fetch(`/api/google/status?employee_id=${currentEmployee.id}`);
      const data = await response.json();
      if (response.ok) {
        setGoogleStatus(data);
      }
    } catch (err) {
      console.error('Failed to check Google status:', err);
    }
  }, [currentEmployee?.id]);

  // Fetch emails for a specific contact
  const fetchEmailsForContact = useCallback(async (contactId: string, contactEmail: string) => {
    if (!currentEmployee?.id || !googleStatus?.connected || !googleStatus?.hasGmail || !contactEmail) {
      return;
    }
    
    setLoadingEmails(contactId);
    try {
      const query = encodeURIComponent(`from:${contactEmail} OR to:${contactEmail}`);
      const response = await fetch(`/api/google/gmail?employee_id=${currentEmployee.id}&max=10&q=${query}`);
      const data = await response.json();
      
      if (response.ok) {
        setContactEmails(prev => ({ ...prev, [contactId]: data.emails || [] }));
      }
    } catch (err) {
      console.error('Failed to fetch contact emails:', err);
    } finally {
      setLoadingEmails(null);
    }
  }, [currentEmployee?.id, googleStatus?.connected, googleStatus?.hasGmail]);

  // Toggle email history row
  const toggleEmailRow = (contactId: string, contactEmail: string) => {
    if (expandedEmailRow === contactId) {
      setExpandedEmailRow(null);
    } else {
      setExpandedEmailRow(contactId);
      if (!contactEmails[contactId] && contactEmail) {
        fetchEmailsForContact(contactId, contactEmail);
      }
    }
  };

  // Fetch employee on mount
  useEffect(() => {
    fetchEmployee();
  }, [fetchEmployee]);

  // Check Google status when employee is loaded
  useEffect(() => {
    if (currentEmployee?.id) {
      checkGoogleStatus();
    }
  }, [currentEmployee?.id, checkGoogleStatus]);

  // Fetch contacts
  useEffect(() => {
    fetchContacts();
  }, []);

  async function fetchContacts() {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('network_contacts')
      .select('*')
      .order('priority', { ascending: true })
      .order('next_followup_date', { ascending: true });

    if (error) {
      console.error('Error fetching contacts:', error);
    } else {
      setContacts(data || []);
    }
    setLoading(false);
  }

  // Create contact
  async function createContact() {
    if (!supabase) {
      alert('Database not connected. Check your Supabase credentials in .env.local');
      return;
    }
    
    // Validate required field
    if (!formData.name.trim()) {
      alert('Name is required');
      return;
    }
    
    // Clean up data - convert empty strings to null for optional date fields
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
      console.error('Error creating contact:', error);
      alert(`Failed to create contact: ${error.message}`);
    } else {
      resetForm();
      fetchContacts();
    }
  }

  // Update contact
  async function updateContact() {
    if (!supabase || !editingContact) return;

    // Clean up data - convert empty strings to null for optional date fields
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
      console.error('Error updating contact:', error);
      alert(`Failed to update contact: ${error.message}`);
    } else {
      resetForm();
      fetchContacts();
    }
  }

  // Log followup (quick action)
  async function logFollowup(contact: NetworkContact) {
    if (!supabase) return;
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const { error } = await supabase
      .from('network_contacts')
      .update({
        last_contact_date: today,
        next_followup_date: nextWeek,
        followup_count: (contact.followup_count || 0) + 1,
        first_contact_date: contact.first_contact_date || today,
      })
      .eq('id', contact.id);

    if (error) {
      console.error('Error logging followup:', error);
    } else {
      fetchContacts();
    }
  }

  // Delete contact
  async function deleteContact(id: string) {
    if (!supabase) return;

    const { error } = await supabase
      .from('network_contacts')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting contact:', error);
      alert('Failed to delete contact');
    } else {
      fetchContacts();
    }
    setDeleteConfirm({ show: false, id: null });
  }

  function resetForm() {
    setFormData({
      name: '',
      title: '',
      organization: '',
      phone: '',
      email: '',
      linkedin: '',
      contact_type: 'other',
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

  // Filter contacts
  const filteredContacts = contacts.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.organization && c.organization.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (c.title && c.title.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesType = filterType === 'all' || c.contact_type === filterType;
    const matchesPriority = filterPriority === 'all' || c.priority === filterPriority;
    return matchesSearch && matchesType && matchesPriority;
  });

  // Calculate stats
  const totalContacts = contacts.length;
  const hotContacts = contacts.filter(c => c.priority === 'hot').length;
  const needsFollowup = contacts.filter(c => {
    if (!c.next_followup_date) return false;
    return new Date(c.next_followup_date) <= new Date();
  }).length;
  const investors = contacts.filter(c => ['investor', 'angel', 'vc'].includes(c.contact_type)).length;

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

  const priorityLabels: Record<NetworkContact['priority'], string> = {
    hot: '🔥 Hot',
    warm: '☀️ Warm',
    cold: '❄️ Cold',
  };

  function isOverdue(date: string | null): boolean {
    if (!date) return false;
    return new Date(date) < new Date();
  }

  // Parse bulk text input (CSV, TSV, or freeform text)
  function parseBulkText(text: string): ParsedContact[] {
    if (!text.trim()) return [];
    
    const lines = text.trim().split('\n').filter(line => line.trim());
    const results: ParsedContact[] = [];
    
    // Detect format: CSV, TSV, or freeform
    const firstLine = lines[0];
    const isCSV = firstLine.includes(',');
    const isTSV = firstLine.includes('\t');
    
    // Check if first line is a header
    const headerKeywords = ['name', 'email', 'phone', 'title', 'organization', 'company', 'linkedin'];
    const firstLineLower = firstLine.toLowerCase();
    const hasHeader = headerKeywords.some(keyword => firstLineLower.includes(keyword));
    
    if (isCSV || isTSV) {
      const delimiter = isTSV ? '\t' : ',';
      const dataLines = hasHeader ? lines.slice(1) : lines;
      
      // Parse header to determine column mapping
      let columnMap: Record<string, number> = {};
      if (hasHeader) {
        const headers = firstLine.split(delimiter).map(h => h.trim().toLowerCase().replace(/["']/g, ''));
        headers.forEach((header, idx) => {
          if (header.includes('name') || header === 'full name') columnMap.name = idx;
          else if (header.includes('email') || header === 'e-mail') columnMap.email = idx;
          else if (header.includes('phone') || header.includes('tel') || header.includes('mobile')) columnMap.phone = idx;
          else if (header.includes('title') || header.includes('position') || header.includes('role')) columnMap.title = idx;
          else if (header.includes('org') || header.includes('company') || header.includes('school')) columnMap.organization = idx;
          else if (header.includes('linkedin')) columnMap.linkedin = idx;
          else if (header.includes('note')) columnMap.notes = idx;
        });
      } else {
        // Default column order: name, email, phone, title, organization
        columnMap = { name: 0, email: 1, phone: 2, title: 3, organization: 4 };
      }
      
      for (const line of dataLines) {
        // Handle quoted CSV fields
        const cols = parseCSVLine(line, delimiter);
        const name = cols[columnMap.name]?.trim() || '';
        
        if (!name) continue;
        
        results.push({
          name,
          email: cols[columnMap.email]?.trim() || undefined,
          phone: cols[columnMap.phone]?.trim() || undefined,
          title: cols[columnMap.title]?.trim() || undefined,
          organization: cols[columnMap.organization]?.trim() || undefined,
          linkedin: cols[columnMap.linkedin]?.trim() || undefined,
          notes: cols[columnMap.notes]?.trim() || undefined,
          valid: true,
        });
      }
    } else {
      // Freeform text parsing - try to extract name and email/phone from each line
      for (const line of lines) {
        const parsed = parseFreeformLine(line);
        if (parsed.name) {
          results.push(parsed);
        }
      }
    }
    
    // Validate parsed contacts
    return results.map(contact => {
      if (!contact.name || contact.name.length < 2) {
        return { ...contact, valid: false, error: 'Name is required' };
      }
      if (contact.email && !isValidEmail(contact.email)) {
        return { ...contact, valid: false, error: 'Invalid email format' };
      }
      return contact;
    });
  }
  
  // Parse a single CSV line handling quoted fields
  function parseCSVLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' && (i === 0 || line[i-1] !== '\\')) {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim().replace(/^["']|["']$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^["']|["']$/g, ''));
    return result;
  }
  
  // Parse freeform text line
  function parseFreeformLine(line: string): ParsedContact {
    // Email regex
    const emailMatch = line.match(/[\w.+-]+@[\w.-]+\.\w+/);
    // Phone regex (various formats)
    const phoneMatch = line.match(/(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/);
    // LinkedIn URL
    const linkedinMatch = line.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+\/?/i);
    
    // Remove extracted data to get the remaining text (likely name/title/org)
    let remaining = line;
    if (emailMatch) remaining = remaining.replace(emailMatch[0], '');
    if (phoneMatch) remaining = remaining.replace(phoneMatch[0], '');
    if (linkedinMatch) remaining = remaining.replace(linkedinMatch[0], '');
    
    // Clean up remaining text
    remaining = remaining.replace(/[,\-|;]/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Try to split remaining into name, title, organization
    const parts = remaining.split(/\s{2,}|@|\|/).map(p => p.trim()).filter(Boolean);
    
    return {
      name: parts[0] || '',
      title: parts[1] || undefined,
      organization: parts[2] || undefined,
      email: emailMatch?.[0],
      phone: phoneMatch?.[0],
      linkedin: linkedinMatch?.[0],
      valid: Boolean(parts[0]),
    };
  }
  
  function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
  
  // Handle text input change with live parsing
  function handleBulkTextChange(text: string) {
    setBulkText(text);
    setBulkError(null);
    const parsed = parseBulkText(text);
    setParsedContacts(parsed);
  }
  
  function convertImageToJpeg(file: File, maxDimension = 2048): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          const scale = maxDimension / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Could not create canvas context')); return; }
        ctx.drawImage(img, 0, 0, width, height);
        const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve(jpegDataUrl);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load image'));
      };
      img.src = objectUrl;
    });
  }

  // Handle image upload
  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setImageFile(file);
    setBulkError(null);
    
    // Create preview by converting to JPEG (handles HEIC and other formats)
    try {
      const jpegDataUrl = await convertImageToJpeg(file);
      setImagePreview(jpegDataUrl);
    } catch {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }
  
  // Parse image using AI
  async function parseImageWithAI() {
    if (!imageFile) return;
    
    setParsingImage(true);
    setBulkError(null);
    
    try {
      // Convert image to JPEG base64 (handles HEIC/HEIF and other unsupported formats)
      const base64 = await convertImageToJpeg(imageFile);
      
      // Call API endpoint for image parsing
      const response = await fetch('/api/parse-contacts-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to parse image');
      }
      
      const data = await response.json();
      if (data.contacts && Array.isArray(data.contacts)) {
        setParsedContacts(data.contacts.map((c: Partial<ParsedContact>) => ({
          ...c,
          valid: Boolean(c.name),
        })));
      }
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'Failed to parse image. Try pasting the text manually.');
    } finally {
      setParsingImage(false);
    }
  }
  
  // Import parsed contacts to database
  async function importBulkContacts() {
    if (!supabase) {
      setBulkError('Database not connected');
      return;
    }
    
    const validContacts = parsedContacts.filter(c => c.valid);
    if (validContacts.length === 0) {
      setBulkError('No valid contacts to import');
      return;
    }
    
    setBulkImporting(true);
    setBulkError(null);
    
    try {
      const contactsToInsert = validContacts.map(c => ({
        name: c.name,
        title: c.title || '',
        organization: c.organization || '',
        phone: c.phone || '',
        email: c.email || '',
        linkedin: c.linkedin || '',
        notes: c.notes || '',
        contact_type: bulkDefaults.contact_type,
        priority: bulkDefaults.priority,
        stage: bulkDefaults.stage,
        first_contact_date: null,
        last_contact_date: null,
        next_followup_date: null,
        potential_value: '',
        how_they_can_help: '',
        how_we_met: '',
        referred_by: '',
      }));
      
      const { error } = await supabase
        .from('network_contacts')
        .insert(contactsToInsert);
      
      if (error) throw error;
      
      // Success - reset and refresh
      resetBulkUpload();
      fetchContacts();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'Failed to import contacts');
    } finally {
      setBulkImporting(false);
    }
  }
  
  function resetBulkUpload() {
    setShowBulkModal(false);
    setBulkText('');
    setParsedContacts([]);
    setImageFile(null);
    setImagePreview(null);
    setBulkError(null);
    setBulkUploadTab('text');
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
            <div className="module-icon" style={{ backgroundColor: '#10b98115', color: '#10b981' }}>
              <Network size={24} />
            </div>
            <div>
              <h1>Network & Fundraising</h1>
              <p>Your networking machine: investors, connectors, IFCs, and partnerships all in one place.</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="module-main">
        {/* Stats Row */}
        <div className="module-stats-row">
          <div className="module-stat">
            <span className="module-stat-value">{totalContacts}</span>
            <span className="module-stat-label">Total Contacts</span>
          </div>
          <div className="module-stat">
            <span className="module-stat-value" style={{ color: '#ef4444' }}>{hotContacts}</span>
            <span className="module-stat-label">🔥 Hot Leads</span>
          </div>
          <div className="module-stat">
            <span className="module-stat-value" style={{ color: needsFollowup > 0 ? '#f59e0b' : undefined }}>{needsFollowup}</span>
            <span className="module-stat-label">Needs Follow-up</span>
          </div>
          <div className="module-stat">
            <span className="module-stat-value">{investors}</span>
            <span className="module-stat-label">Investors</span>
          </div>
        </div>

        {/* Actions Bar */}
        <div className="module-actions-bar">
          <div className="module-search">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="module-actions">
            <select 
              className="module-filter-select"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="all">All Types</option>
              {Object.entries(typeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select 
              className="module-filter-select"
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
            >
              <option value="all">All Priorities</option>
              <option value="hot">🔥 Hot</option>
              <option value="warm">☀️ Warm</option>
              <option value="cold">❄️ Cold</option>
            </select>
            <button className="module-secondary-btn" onClick={() => setShowBulkModal(true)}>
              <Upload size={18} />
              Bulk Upload
            </button>
            <button className="module-primary-btn" onClick={() => setShowModal(true)}>
              <Plus size={18} />
              Add Contact
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="module-table-container">
          {loading ? (
            <SkeletonTable rows={5} cols={6} />
          ) : filteredContacts.length > 0 ? (
            <table className="module-table">
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Type</th>
                  <th>Stage</th>
                  <th>Priority</th>
                  <th>Next Follow-up</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map((contact) => (
                  <React.Fragment key={contact.id}>
                    <tr className={isOverdue(contact.next_followup_date) ? 'overdue-row' : ''}>
                      <td>
                        <div className="contact-cell">
                          <span className="module-table-name">{contact.name}</span>
                          <span className="contact-subtitle">
                            {contact.title}{contact.title && contact.organization ? ' @ ' : ''}{contact.organization}
                          </span>
                          <div className="contact-links">
                            {contact.phone && (
                              <a href={`tel:${contact.phone}`} className="contact-link" title={contact.phone}>
                                <Phone size={12} />
                              </a>
                            )}
                            {contact.email && (
                              <a href={`mailto:${contact.email}`} className="contact-link" title={contact.email}>
                                <Mail size={12} />
                              </a>
                            )}
                            {contact.linkedin && (
                              <a href={contact.linkedin} target="_blank" rel="noopener noreferrer" className="contact-link">
                                <Linkedin size={12} />
                              </a>
                            )}
                            {/* Email History Toggle - only show if Google is connected with Gmail access */}
                            {contact.email && googleStatus?.connected && googleStatus?.hasGmail && (
                              <button
                                className={`contact-link email-history-toggle ${expandedEmailRow === contact.id ? 'active' : ''}`}
                                onClick={() => toggleEmailRow(contact.id, contact.email)}
                                title="View email history"
                              >
                                {expandedEmailRow === contact.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`module-type ${contact.contact_type}`}>{typeLabels[contact.contact_type]}</span>
                      </td>
                      <td>
                        <span className={`module-status ${contact.stage}`}>{stageLabels[contact.stage]}</span>
                      </td>
                      <td>
                        <span className={`module-priority ${contact.priority}`}>{priorityLabels[contact.priority]}</span>
                      </td>
                      <td>
                        {contact.next_followup_date ? (
                          <span className={isOverdue(contact.next_followup_date) ? 'overdue-date' : ''}>
                            {contact.next_followup_date}
                          </span>
                        ) : '—'}
                      </td>
                      <td>
                        <div className="module-table-actions">
                          <button 
                            className="module-table-action followup" 
                            onClick={() => logFollowup(contact)}
                            title="Log follow-up"
                          >
                            <Clock size={14} />
                          </button>
                          <button className="module-table-action" onClick={() => openEditModal(contact)}>
                            <Edit2 size={14} />
                          </button>
                          <button className="module-table-action delete" onClick={() => setDeleteConfirm({ show: true, id: contact.id })}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {/* Email History Row */}
                    {expandedEmailRow === contact.id && (
                      <tr className="email-history-row">
                        <td colSpan={6}>
                          <div className="email-history-content">
                            {loadingEmails === contact.id ? (
                              <div className="email-history-loading">
                                <Loader2 size={16} className="spin" />
                                <span>Loading email history...</span>
                              </div>
                            ) : contactEmails[contact.id]?.length > 0 ? (
                              <div className="email-history-list">
                                <div className="email-history-header">
                                  <Mail size={14} />
                                  <span>Email History ({contactEmails[contact.id].length} emails)</span>
                                </div>
                                {contactEmails[contact.id].slice(0, 5).map((email) => (
                                  <div key={email.id} className={`email-history-item ${email.isUnread ? 'unread' : ''}`}>
                                    <div className="email-history-meta">
                                      <span className="email-subject">{email.subject || '(No subject)'}</span>
                                      <span className="email-date">
                                        {new Date(email.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                      </span>
                                    </div>
                                    <div className="email-from">
                                      {email.fromEmail === contact.email ? `From: ${email.from}` : `To: ${contact.email}`}
                                    </div>
                                    <div className="email-snippet">{email.snippet}</div>
                                  </div>
                                ))}
                                {contactEmails[contact.id].length > 5 && (
                                  <div className="email-history-more">
                                    +{contactEmails[contact.id].length - 5} more emails
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="email-history-empty">
                                <Mail size={20} />
                                <span>No email history found with this contact</span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="module-empty-state">
              <Network size={48} />
              <h3>No contacts yet</h3>
              <p>Start building your network</p>
            </div>
          )}
        </div>
      </main>

      {/* Modal */}
      {showModal && (
        <ModalOverlay className="module-modal-overlay" onClose={() => resetForm()}>
          <div className="module-modal module-modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="module-modal-header">
              <h2>{editingContact ? 'Edit Contact' : 'Add Contact'}</h2>
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
                  <label>Title</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g. CEO, IFC President"
                  />
                </div>
              </div>
              <div className="module-form-row">
                <div className="module-form-group">
                  <label>Organization</label>
                  <input
                    type="text"
                    value={formData.organization}
                    onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                    placeholder="Company or school"
                  />
                </div>
                <div className="module-form-group">
                  <label>Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>
              <div className="module-form-row">
                <div className="module-form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="module-form-group">
                  <label>LinkedIn</label>
                  <input
                    type="url"
                    value={formData.linkedin}
                    onChange={(e) => setFormData({ ...formData, linkedin: e.target.value })}
                    placeholder="https://linkedin.com/in/..."
                  />
                </div>
              </div>
              <div className="module-form-row">
                <div className="module-form-group">
                  <label>Contact Type</label>
                  <select
                    value={formData.contact_type}
                    onChange={(e) => setFormData({ ...formData, contact_type: e.target.value as NetworkContact['contact_type'] })}
                  >
                    {Object.entries(typeLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="module-form-group">
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
                <div className="module-form-group">
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
              <div className="module-form-row">
                <div className="module-form-group">
                  <label>First Contact Date</label>
                  <input
                    type="date"
                    value={formData.first_contact_date}
                    onChange={(e) => setFormData({ ...formData, first_contact_date: e.target.value })}
                  />
                </div>
                <div className="module-form-group">
                  <label>Last Contact Date</label>
                  <input
                    type="date"
                    value={formData.last_contact_date}
                    onChange={(e) => setFormData({ ...formData, last_contact_date: e.target.value })}
                  />
                </div>
                <div className="module-form-group">
                  <label>Next Follow-up</label>
                  <input
                    type="date"
                    value={formData.next_followup_date}
                    onChange={(e) => setFormData({ ...formData, next_followup_date: e.target.value })}
                  />
                </div>
              </div>
              <div className="module-form-group">
                <label>How They Can Help</label>
                <textarea
                  value={formData.how_they_can_help}
                  onChange={(e) => setFormData({ ...formData, how_they_can_help: e.target.value })}
                  placeholder="What value can they bring? Intros, funding, expertise..."
                  rows={2}
                />
              </div>
              <div className="module-form-row">
                <div className="module-form-group">
                  <label>How We Met</label>
                  <input
                    type="text"
                    value={formData.how_we_met}
                    onChange={(e) => setFormData({ ...formData, how_we_met: e.target.value })}
                    placeholder="e.g. Conference, intro from..."
                  />
                </div>
                <div className="module-form-group">
                  <label>Referred By</label>
                  <input
                    type="text"
                    value={formData.referred_by}
                    onChange={(e) => setFormData({ ...formData, referred_by: e.target.value })}
                    placeholder="Who made the intro?"
                  />
                </div>
              </div>
              <div className="module-form-group">
                <label>Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional context, conversation history..."
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
                onClick={editingContact ? updateContact : createContact}
                disabled={!formData.name}
              >
                {editingContact ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Bulk Upload Modal */}
      {showBulkModal && (
        <ModalOverlay className="module-modal-overlay" onClose={() => resetBulkUpload()}>
          <div className="module-modal module-modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="module-modal-header">
              <h2>Bulk Upload Contacts</h2>
              <button className="module-modal-close" onClick={() => resetBulkUpload()}>
                <X size={20} />
              </button>
            </div>
            
            {/* Tab Switcher */}
            <div className="bulk-upload-tabs">
              <button
                className={`bulk-tab ${bulkUploadTab === 'text' ? 'active' : ''}`}
                onClick={() => setBulkUploadTab('text')}
              >
                <FileText size={18} />
                Paste Text / CSV
              </button>
              <button
                className={`bulk-tab ${bulkUploadTab === 'image' ? 'active' : ''}`}
                onClick={() => setBulkUploadTab('image')}
              >
                <Image size={18} />
                Upload Image
              </button>
            </div>
            
            <div className="module-modal-body">
              {bulkUploadTab === 'text' ? (
                <div className="bulk-text-section">
                  <div className="module-form-group">
                    <label>Paste contacts (CSV, tab-separated, or plain text)</label>
                    <textarea
                      value={bulkText}
                      onChange={(e) => handleBulkTextChange(e.target.value)}
                      placeholder={`Paste your contacts here. Supported formats:

CSV with headers:
Name,Email,Phone,Title,Organization
John Smith,john@email.com,555-123-4567,CEO,Acme Inc

Tab-separated:
John Smith	john@email.com	555-123-4567

Plain text (one contact per line):
John Smith john@email.com 555-123-4567
Jane Doe - VP Sales @ BigCorp - jane@bigcorp.com`}
                      rows={8}
                      className="bulk-textarea"
                    />
                  </div>
                </div>
              ) : (
                <div className="bulk-image-section">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    style={{ display: 'none' }}
                  />
                  
                  {!imagePreview ? (
                    <div 
                      className="bulk-image-dropzone"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Image size={48} />
                      <p>Click to upload an image</p>
                      <span>Screenshot of a contact list, business cards, spreadsheet, etc.</span>
                    </div>
                  ) : (
                    <div className="bulk-image-preview-container">
                      <img src={imagePreview} alt="Uploaded" className="bulk-image-preview" />
                      <div className="bulk-image-actions">
                        <button 
                          className="module-secondary-btn"
                          onClick={() => { setImageFile(null); setImagePreview(null); setParsedContacts([]); }}
                        >
                          Remove
                        </button>
                        <button 
                          className="module-primary-btn"
                          onClick={parseImageWithAI}
                          disabled={parsingImage}
                        >
                          {parsingImage ? 'Parsing...' : 'Extract Contacts'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* Default Values */}
              <div className="bulk-defaults">
                <h4>Default values for imported contacts:</h4>
                <div className="module-form-row">
                  <div className="module-form-group">
                    <label>Contact Type</label>
                    <select
                      value={bulkDefaults.contact_type}
                      onChange={(e) => setBulkDefaults({ ...bulkDefaults, contact_type: e.target.value as NetworkContact['contact_type'] })}
                    >
                      {Object.entries(typeLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="module-form-group">
                    <label>Priority</label>
                    <select
                      value={bulkDefaults.priority}
                      onChange={(e) => setBulkDefaults({ ...bulkDefaults, priority: e.target.value as NetworkContact['priority'] })}
                    >
                      <option value="hot">🔥 Hot</option>
                      <option value="warm">☀️ Warm</option>
                      <option value="cold">❄️ Cold</option>
                    </select>
                  </div>
                  <div className="module-form-group">
                    <label>Stage</label>
                    <select
                      value={bulkDefaults.stage}
                      onChange={(e) => setBulkDefaults({ ...bulkDefaults, stage: e.target.value as NetworkContact['stage'] })}
                    >
                      {Object.entries(stageLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              
              {/* Preview Table */}
              {parsedContacts.length > 0 && (
                <div className="bulk-preview">
                  <h4>
                    Preview ({parsedContacts.filter(c => c.valid).length} valid, {parsedContacts.filter(c => !c.valid).length} invalid)
                  </h4>
                  <div className="bulk-preview-table-container">
                    <table className="bulk-preview-table">
                      <thead>
                        <tr>
                          <th>Status</th>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Phone</th>
                          <th>Title</th>
                          <th>Organization</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedContacts.map((contact, idx) => (
                          <tr key={idx} className={contact.valid ? '' : 'invalid-row'}>
                            <td>
                              {contact.valid ? (
                                <CheckCircle size={16} className="valid-icon" />
                              ) : (
                                <span title={contact.error}>
                                  <AlertCircle size={16} className="invalid-icon" />
                                </span>
                              )}
                            </td>
                            <td>{contact.name || '—'}</td>
                            <td>{contact.email || '—'}</td>
                            <td>{contact.phone || '—'}</td>
                            <td>{contact.title || '—'}</td>
                            <td>{contact.organization || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              
              {/* Error Message */}
              {bulkError && (
                <div className="bulk-error">
                  <AlertCircle size={16} />
                  {bulkError}
                </div>
              )}
            </div>
            
            <div className="module-modal-footer">
              <button className="module-cancel-btn" onClick={() => resetBulkUpload()}>
                Cancel
              </button>
              <button
                className="module-primary-btn"
                onClick={importBulkContacts}
                disabled={bulkImporting || parsedContacts.filter(c => c.valid).length === 0}
              >
                {bulkImporting ? 'Importing...' : `Import ${parsedContacts.filter(c => c.valid).length} Contacts`}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteConfirm.show}
        title="Delete Contact"
        message="Are you sure you want to delete this contact? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        onConfirm={() => deleteConfirm.id && deleteContact(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm({ show: false, id: null })}
      />
    </div>
  );
}
