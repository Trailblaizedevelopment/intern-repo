import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Create client only if credentials are available
let supabase: SupabaseClient | null = null;

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

export { supabase };

// Database Types
export interface Employee {
  id: string;
  auth_user_id?: string; // Links to Supabase Auth user
  name: string;
  email: string;
  role: EmployeeRole;
  seniority: EmployeeSeniority;
  department: string;
  status: 'active' | 'onboarding' | 'inactive';
  start_date: string;
  avatar_url: string;
  created_at: string;
}

// Employee Role Types
export type EmployeeRole = 
  | 'founder' 
  | 'cofounder' 
  | 'growth_intern' 
  | 'engineer' 
  | 'sales_intern'
  | 'marketing_intern'
  | 'operations';

export type EmployeeSeniority = 1 | 2 | 3 | 4 | 5;

export const ROLE_HIERARCHY: Record<EmployeeRole, number> = {
  growth_intern: 1,
  sales_intern: 1,
  marketing_intern: 1,
  engineer: 2,
  operations: 3,
  cofounder: 5,
  founder: 6,
};

export const ROLE_LABELS: Record<EmployeeRole, string> = {
  founder: 'Founder',
  cofounder: 'Co-Founder',
  growth_intern: 'Growth Intern',
  engineer: 'Engineer',
  sales_intern: 'Sales Intern',
  marketing_intern: 'Marketing Intern',
  operations: 'Operations',
};

// Specific permissions for each role
export const ROLE_PERMISSIONS: Record<EmployeeRole, string[]> = {
  // Founders - Full Nucleus access
  founder: ['nucleus', 'all'],
  cofounder: ['nucleus', 'all'],
  
  // Growth Intern - Alumni outreach, personal leads, alumni list
  growth_intern: [
    'tasks',
    'personal_leads',      // Their own leads/contacts
    'alumni_outreach',     // Alumni tracking
    'alumni_list',         // View alumni list
    'announcements',
  ],
  
  // Engineer - Code tasks, product features, bugs
  engineer: [
    'tasks',
    'product_tasks',       // Engineering tasks
    'bugs',                // Bug tracking
    'features',            // Feature requests
    'announcements',
    'team',
  ],
  
  // Sales Intern - Pipeline, leads
  sales_intern: [
    'tasks',
    'personal_leads',
    'pipeline_view',       // View-only pipeline
    'announcements',
  ],
  
  // Marketing Intern - Content, social
  marketing_intern: [
    'tasks',
    'content',
    'social_tracking',
    'announcements',
  ],
  
  // Operations - Tasks, processes
  operations: [
    'tasks',
    'operations',
    'customers_view',
    'announcements',
    'team',
  ],
};

export interface NetworkContact {
  id: string;
  name: string;
  title: string;
  organization: string;
  phone: string;
  email: string;
  linkedin: string;
  contact_type: 'investor' | 'angel' | 'vc' | 'partnership' | 'competitor' | 'connector' | 'ifc_president' | 'ifc_advisor' | 'chapter_president' | 'chapter_advisor' | 'greek_life' | 'consultant' | 'other';
  priority: 'hot' | 'warm' | 'cold';
  stage: 'identified' | 'researching' | 'outreach_pending' | 'first_contact' | 'follow_up' | 'in_conversation' | 'meeting_scheduled' | 'met' | 'nurturing' | 'committed' | 'passed' | 'dormant';
  first_contact_date: string;
  last_contact_date: string;
  next_followup_date: string;
  followup_count: number;
  potential_value: string;
  how_they_can_help: string;
  how_we_met: string;
  referred_by: string;
  notes: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface ContactFollowup {
  id: string;
  contact_id: string;
  followup_type: 'email' | 'call' | 'meeting' | 'text' | 'linkedin' | 'other';
  summary: string;
  outcome: string;
  next_action: string;
  followup_date: string;
  created_at: string;
}

// Legacy alias for backwards compatibility
export type FundraisingContact = NetworkContact;

export type DealStage = 'lead' | 'demo_booked' | 'first_demo' | 'second_call' | 'contract_sent' | 'closed_won' | 'closed_lost' | 'hold_off';

export interface Deal {
  id: string;
  name: string;
  organization: string;
  contact_name: string;
  fraternity: string;
  phone: string;
  email: string;
  value: number;
  conference?: string | null;
  stage: DealStage;
  temperature: 'hot' | 'warm' | 'cold';
  expected_close: string;
  last_contact: string;
  next_followup: string;
  followup_count: number;
  notes: string;
  created_at: string;
}

// Gamification types
export interface SalesStats {
  total_points: number;
  level: number;
  current_streak: number;
  best_streak: number;
  deals_closed: number;
  demos_booked: number;
  followups_today: number;
}

export const STAGE_CONFIG: Record<DealStage, { label: string; points: number; emoji: string; color: string }> = {
  lead: { label: 'New Lead', points: 10, emoji: '🎯', color: '#6b7280' },
  demo_booked: { label: 'Demo Booked', points: 25, emoji: '📅', color: '#3b82f6' },
  first_demo: { label: 'First Demo', points: 50, emoji: '🎬', color: '#8b5cf6' },
  second_call: { label: 'Second Call', points: 75, emoji: '🤝', color: '#f59e0b' },
  contract_sent: { label: 'Contract Sent', points: 100, emoji: '📝', color: '#ec4899' },
  closed_won: { label: 'Closed Won', points: 500, emoji: '🏆', color: '#10b981' },
  closed_lost: { label: 'Closed Lost', points: 0, emoji: '❌', color: '#ef4444' },
  hold_off: { label: 'Hold Off', points: 0, emoji: '⏸️', color: '#9ca3af' },
};

export const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2500, 4000, 6000, 10000];
export const LEVEL_TITLES = ['Rookie', 'Starter', 'Hustler', 'Closer', 'Dealmaker', 'Rainmaker', 'Sales Star', 'Legend', 'Champion', 'GOAT'];

/** MRR-based level thresholds (dollars): $1k, $5k, $10k, $15k, $20k, then +$5k each */
export const MRR_LEVEL_THRESHOLDS = [1000, 5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000, 50000];
export const MRR_LEVEL_TITLES = ['Getting started', 'Rookie', 'Starter', 'Hustler', 'Closer', 'Dealmaker', 'Rainmaker', 'Sales Star', 'Legend', 'Champion', 'GOAT'];

export interface Task {
  id: string;
  title: string;
  description: string;
  assignee: string;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'in_progress' | 'done';
  due_date: string;
  created_at: string;
}

export interface Customer {
  id: string;
  name: string;
  organization: string;
  email: string;
  stage: 'onboarding' | 'active' | 'at_risk' | 'churned';
  health: 'good' | 'warning' | 'critical';
  next_action: string;
  mrr: number;
  created_at: string;
}

// Chapter with full onboarding checklist
export interface Chapter {
  id: string;
  chapter_name: string;
  school: string;
  fraternity: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  
  status: 'onboarding' | 'active' | 'at_risk' | 'churned';
  health: 'good' | 'warning' | 'critical';
  mrr: number;
  
  // Onboarding Checklist
  chapter_created: boolean;
  exec_account: boolean;
  scheduled_first_call: boolean;
  exec_demo: boolean;
  alumni_list: boolean;
  alumni_emails_sent: boolean;
  member_onboarding: boolean;
  budget_set: boolean;
  qr_code: boolean;
  simple_function_guide: boolean;
  events_scheduled: boolean;
  test_announcements: boolean;
  message_board_started: boolean;
  invitations_created: boolean;
  facebook_group: boolean;
  linkedin_group: boolean;
  instagram_post: boolean;
  
  onboarding_started: string;
  onboarding_completed: string;
  last_activity: string;
  next_action: string;
  notes: string;
  alumni_channels: string;
  
  // Payment Tracking
  payment_day: number | null;
  payment_type: 'monthly' | 'one_time' | 'annual';
  payment_amount: number;
  payment_start_date: string | null;
  last_payment_date: string | null;
  next_payment_date: string | null;

  // Signup links
  alumni_join_link: string | null;
  actives_join_link: string | null;

  // Opt-out toggles
  email_outreach_enabled?: boolean;
  conversations_enabled?: boolean;

  // Sales tracking (added by CS rebuild)
  contract_signed?: boolean;
  contract_signed_date?: string;
  contract_signed_notes?: string;
  payment_received?: boolean;
  payment_received_date?: string;
  payment_amount_received?: number;
  payment_received_notes?: string;
  onboarding_form_submitted?: boolean;
  onboarding_form_submitted_date?: string;
  onboarding_form_notes?: string;

  // Success notes
  exec_notes?: string;
  bonus_notes?: string;

  created_at: string;
  updated_at: string;
}

// Onboarding step definition for UI
export const ONBOARDING_STEPS = [
  // Setup
  { key: 'setup_groupchat_created',    label: 'Groupchat created with admin',        category: 'setup' },
  { key: 'setup_chapter_on_space',     label: 'Chapter created on Space',            category: 'setup' },
  { key: 'setup_chapter_on_platform',  label: 'Chapter created on Trailblaize',      category: 'setup' },
  { key: 'setup_submission_form_sent', label: 'Submission form sent',                category: 'setup' },
  { key: 'setup_submission_received',  label: 'Submission form received',            category: 'setup' },
  // Alumni Activation
  { key: 'activate_ig_collab',         label: 'Collab IG post done',                 category: 'activation' },
  { key: 'activate_facebook_flyer',    label: 'Facebook group flyer sent',           category: 'activation' },
  { key: 'activate_linkedin_post',     label: 'LinkedIn group post done',            category: 'activation' },
  { key: 'activate_groupme_blast',     label: 'GroupMe blast sent',                  category: 'activation' },
  { key: 'activate_newsletter',        label: 'Newsletter sent',                     category: 'activation' },
  // Data Import
  { key: 'data_list_uploaded',         label: 'Alumni list uploaded',                category: 'data' },
  { key: 'data_counts_verified',       label: 'Phone/email counts verified',         category: 'data' },
  { key: 'data_imessage_filtered',     label: 'iMessage pre-filter run',             category: 'data' },
  // Linq Outreach
  { key: 'linq_touch1_sent',           label: 'Touch 1 sent',                        category: 'linq' },
  { key: 'linq_touch2_sent',           label: 'Touch 2 sent',                        category: 'linq' },
  { key: 'linq_touch3_sent',           label: 'Touch 3 sent',                        category: 'linq' },
  { key: 'linq_100_signups',           label: '100+ alumni signed up 🎯',            category: 'linq' },
  // Email Outreach
  { key: 'email_sequence_live',        label: 'SendGrid sequence live',              category: 'email' },
  { key: 'email_blast_sent',           label: 'Email blast sent',                    category: 'email' },
  // Success Activation
  { key: 'success_first_checkin',      label: 'First exec check-in done',            category: 'success_setup' },
  { key: 'success_actives_list',       label: 'Actives job/internship list collected', category: 'success_setup' },
  { key: 'success_first_match',        label: 'First matchmaking run',               category: 'success_setup' },
  { key: 'success_video_sent',         label: 'Chapter video asset sent',            category: 'success_setup' },
] as const;

export interface EnterpriseContract {
  id: string;
  organization: string;
  type: 'ifc' | 'national_org' | 'partnership' | 'other';
  contact_name: string;
  contact_email: string;
  stage: 'prospecting' | 'negotiation' | 'contract_sent' | 'signed' | 'lost';
  value: number;
  notes: string;
  created_at: string;
}

export interface Payment {
  id: string;
  chapter_id: string;
  amount: number;
  payment_date: string;
  payment_method: 'card' | 'bank_transfer' | 'check' | 'cash' | 'other';
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  reference_number: string | null;
  notes: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// Accounting Types
// ============================================

export type ExpenseCategory = 'software' | 'travel' | 'legal' | 'marketing' | 'payroll' | 'office' | 'other';
export type ExpensePaymentMethod = 'brex' | 'personal' | 'wire' | 'other';
export type LedgerEntryType = 'revenue' | 'expense';

export interface Expense {
  id: string;
  date: string;
  amount: number;
  category: ExpenseCategory | null;
  vendor: string | null;
  description: string | null;
  payment_method: ExpensePaymentMethod;
  receipt_url: string | null;
  type: LedgerEntryType;
  import_batch_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImportBatch {
  id: string;
  year: number;
  month: number;
  filename: string | null;
  total_revenue: number;
  total_expenses: number;
  line_count: number;
  created_at: string;
}

export interface MonthlyStatement {
  id: string;
  year: number;
  month: number;
  notes: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// Onboarding System Types
// ============================================

export type ExecutivePosition = 
  | 'president' 
  | 'vice_president' 
  | 'treasurer' 
  | 'secretary' 
  | 'alumni_relations' 
  | 'social_chair' 
  | 'recruitment_chair' 
  | 'other';

export const EXECUTIVE_POSITION_LABELS: Record<ExecutivePosition, string> = {
  president: 'President',
  vice_president: 'Vice President',
  treasurer: 'Treasurer',
  secretary: 'Secretary',
  alumni_relations: 'Alumni Relations Chair',
  social_chair: 'Social Chair',
  recruitment_chair: 'Recruitment Chair',
  other: 'Other',
};

export interface ChapterExecutive {
  id: string;
  chapter_id: string;
  full_name: string;
  position: ExecutivePosition;
  custom_position?: string;
  email: string;
  created_at: string;
  updated_at: string;
}

export type OutreachChannelType = 
  | 'email_newsletter' 
  | 'facebook_group' 
  | 'instagram' 
  | 'linkedin_group' 
  | 'chapter_website' 
  | 'alumni_database' 
  | 'other';

export const OUTREACH_CHANNEL_LABELS: Record<OutreachChannelType, string> = {
  email_newsletter: 'Newsletter (Email or Mail)',
  facebook_group: 'Facebook Group',
  instagram: 'Instagram Page',
  linkedin_group: 'LinkedIn Group',
  chapter_website: 'Chapter Website',
  alumni_database: 'Alumni Database/Email List',
  other: 'Other',
};

export interface ChapterOutreachChannel {
  id: string;
  chapter_id: string;
  channel_type: OutreachChannelType;
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
  created_at: string;
  updated_at: string;
}

export type CheckInFrequency = 'weekly' | 'biweekly' | 'monthly';

export const CHECK_IN_FREQUENCY_LABELS: Record<CheckInFrequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
};

export type HealthScore = 'excellent' | 'good' | 'needs_attention' | 'at_risk';

export const HEALTH_SCORE_LABELS: Record<HealthScore, string> = {
  excellent: 'Excellent',
  good: 'Good',
  needs_attention: 'Needs Attention',
  at_risk: 'At Risk',
};

export const HEALTH_SCORE_COLORS: Record<HealthScore, { bg: string; text: string; glow: string }> = {
  excellent: { bg: '#d1fae5', text: '#065f46', glow: 'rgba(16, 185, 129, 0.3)' },
  good: { bg: '#dbeafe', text: '#1e40af', glow: 'rgba(59, 130, 246, 0.3)' },
  needs_attention: { bg: '#fef3c7', text: '#92400e', glow: 'rgba(245, 158, 11, 0.3)' },
  at_risk: { bg: '#fee2e2', text: '#991b1b', glow: 'rgba(239, 68, 68, 0.3)' },
};

export interface ChapterCheckIn {
  id: string;
  chapter_id: string;
  check_in_date: string;
  notes?: string;
  health_score?: HealthScore;
  created_by?: string;
  created_at: string;
  updated_at: string;
  action_items?: CheckInActionItem[];
}

export interface CheckInActionItem {
  id: string;
  check_in_id: string;
  action_item: string;
  completed: boolean;
  completed_at?: string;
  created_at: string;
}

export interface OnboardingSubmission {
  id: string;
  chapter_id: string;
  submission_data: OnboardingFormData;
  submitted_at: string;
  ip_address?: string;
  user_agent?: string;
}

// Onboarding Form Data Structure
export interface OnboardingFormData {
  // Section 1: Chapter Information
  university: string;
  fraternity: string;
  chapter_designation?: string;
  year_founded?: number;
  estimated_alumni: number;
  active_members: number;
  
  // Section 2: Executive Board
  executives: {
    full_name: string;
    position: ExecutivePosition;
    custom_position?: string;
    email: string;
  }[];
  
  // Section 3: Outreach Channels
  outreach_channels: {
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
  }[];
  
  // Section 4: Alumni List
  alumni_list_file_name?: string;
  alumni_list_file_url?: string;
  no_alumni_list?: boolean;
  
  // Section 5: Demo Schedule
  scheduled_demo_time?: string;
  
  // Section 6: Instagram Launch
  instagram_handle?: string;
  instagram_photo_url?: string;
}

// Extended Chapter type with new onboarding fields
export interface ChapterWithOnboarding extends Chapter {
  onboarding_token?: string;
  onboarding_token_created_at?: string;
  onboarding_submitted_at?: string;
  check_in_frequency?: CheckInFrequency;
  last_check_in_date?: string;
  next_check_in_date?: string;
  chapter_designation?: string;
  year_founded?: number;
  estimated_alumni?: number;
  active_members?: number;
  instagram_handle?: string;
  instagram_photo_url?: string;
  alumni_list_url?: string;
  scheduled_demo_time?: string;
  // New ONBOARDING_STEPS keys (all optional booleans)
  setup_groupchat_created?: boolean;
  setup_chapter_on_space?: boolean;
  setup_chapter_on_platform?: boolean;
  setup_submission_form_sent?: boolean;
  setup_submission_received?: boolean;
  activate_ig_collab?: boolean;
  activate_facebook_flyer?: boolean;
  activate_linkedin_post?: boolean;
  activate_groupme_blast?: boolean;
  activate_newsletter?: boolean;
  data_list_uploaded?: boolean;
  data_counts_verified?: boolean;
  data_imessage_filtered?: boolean;
  linq_touch1_sent?: boolean;
  linq_touch2_sent?: boolean;
  linq_touch3_sent?: boolean;
  linq_100_signups?: boolean;
  email_sequence_live?: boolean;
  email_blast_sent?: boolean;
  success_first_checkin?: boolean;
  success_actives_list?: boolean;
  success_first_match?: boolean;
  success_video_sent?: boolean;
}

// List of common US universities for autocomplete
export const UNIVERSITIES = [
  'University of Alabama',
  'University of Mississippi',
  'University of Georgia',
  'University of Florida',
  'Florida State University',
  'University of Texas at Austin',
  'Texas A&M University',
  'University of Oklahoma',
  'Oklahoma State University',
  'University of Arkansas',
  'Louisiana State University',
  'Auburn University',
  'University of Tennessee',
  'University of Kentucky',
  'University of South Carolina',
  'Clemson University',
  'University of Virginia',
  'Virginia Tech',
  'University of North Carolina at Chapel Hill',
  'North Carolina State University',
  'Duke University',
  'Wake Forest University',
  'Georgia Tech',
  'University of Miami',
  'Vanderbilt University',
  'University of Missouri',
  'Texas Tech University',
  'Baylor University',
  'TCU',
  'SMU',
  'Ole Miss',
  'Mississippi State University',
  'Miami University',
];

// List of common Greek organizations
export const FRATERNITIES = [
  'Phi Delta Theta',
  'Sigma Chi',
  'Sigma Alpha Epsilon',
  'Beta Theta Pi',
  'Kappa Alpha Order',
  'Pi Kappa Alpha',
  'Sigma Nu',
  'Kappa Sigma',
  'Lambda Chi Alpha',
  'Phi Gamma Delta (FIJI)',
  'Alpha Tau Omega',
  'Delta Tau Delta',
  'Sigma Phi Epsilon',
  'Phi Kappa Psi',
  'Pi Kappa Phi',
  'Theta Chi',
  'Delta Chi',
  'Chi Phi',
  'Delta Kappa Epsilon',
  'Zeta Beta Tau',
  'Alpha Epsilon Pi',
  'Alpha Sigma Phi',
  'Phi Kappa Sigma',
  'Tau Kappa Epsilon',
];

export const SORORITIES = [
  'Alpha Chi Omega',
  'Alpha Delta Pi',
  'Alpha Gamma Delta',
  'Alpha Omicron Pi',
  'Alpha Phi',
  'Alpha Xi Delta',
  'Chi Omega',
  'Delta Delta Delta',
  'Delta Gamma',
  'Delta Zeta',
  'Gamma Phi Beta',
  'Kappa Alpha Theta',
  'Kappa Delta',
  'Kappa Kappa Gamma',
  'Phi Mu',
  'Pi Beta Phi',
  'Sigma Kappa',
  'Zeta Tau Alpha',
];

export const GREEK_ORGANIZATIONS = [...FRATERNITIES, ...SORORITIES].sort();

// ============================================
// Alumni Contact Types
// ============================================

export type OutreachStatus = 'not_contacted' | 'touch1_sent' | 'touch2_sent' | 'touch3_sent' | 'verified' | 'pitched' | 'responded' | 'signed_up' | 'wrong_number' | 'opted_out';

export const OUTREACH_STATUS_CONFIG: Record<OutreachStatus, { label: string; color: string; bg: string }> = {
  not_contacted: { label: 'Not Contacted', color: '#6b7280', bg: '#f3f4f6' },
  touch1_sent:   { label: 'Touch 1 Sent',  color: '#7c3aed', bg: '#ede9fe' },
  touch2_sent:   { label: 'Touch 2 Sent',  color: '#9333ea', bg: '#f3e8ff' },
  touch3_sent:   { label: 'Touch 3 Sent',  color: '#a855f7', bg: '#faf5ff' },
  verified:      { label: 'Verified',       color: '#2563eb', bg: '#dbeafe' },
  pitched:       { label: 'Pitched',        color: '#d97706', bg: '#fef3c7' },
  responded:     { label: 'Responded',      color: '#2563eb', bg: '#dbeafe' },
  signed_up:     { label: 'Signed Up',      color: '#16a34a', bg: '#dcfce7' },
  wrong_number:  { label: 'Wrong Number',   color: '#dc2626', bg: '#fee2e2' },
  opted_out:     { label: 'Opted Out',      color: '#4b5563', bg: '#e5e7eb' },
};

export interface PlatformMember {
  id: string;
  chapter_id: string | null;
  external_user_id: string;
  external_chapter_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  grad_year: number | null;
  major: string | null;
  minor: string | null;
  pledge_class: string | null;
  linkedin_url: string | null;
  location: string | null;
  avatar_url: string | null;
  member_status: string | null;
  onboarding_completed: boolean;
  signed_up_at: string | null;
  last_synced_at: string | null;
  alumni_contact_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlumniContact {
  id: string;
  chapter_id: string;
  first_name: string;
  last_name: string;
  phone_primary: string | null;
  phone_secondary: string | null;
  email: string | null;
  year: number | null;
  outreach_status: OutreachStatus;
  is_imessage: boolean | null;
  phone_type: 'mobile' | 'landline' | 'voip' | 'unknown' | null;
  linq_chat_id: string | null;
  provider_conversation_id: string | null;
  assigned_line: number | null;
  touch1_sent_at: string | null;
  touch2_sent_at: string | null;
  touch3_sent_at: string | null;
  last_response_at: string | null;
  response_text: string | null;
  response_classification: string | null;
  // Enrichment fields (populated when alumni signs up on platform)
  platform_user_id: string | null;
  platform_chapter_id: string | null;
  grad_year: number | null;
  major: string | null;
  pledge_class: string | null;
  linkedin_url: string | null;
  location_city: string | null;
  signed_up_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlumniImportSummary {
  imported: number;
  skipped: number;
  duplicates: number;
  dual_phone_count: number;
  errors: { row: number; message: string }[];
}

// ============================================
// Outreach Queue Types
// ============================================

export const SENDING_LINES = [
  { number: 1, label: 'Owen', daily_limit: 45, phone: '+16462101111' },
  { number: 2, label: 'Adam', daily_limit: 50, phone: '+16462668785' },
  { number: 3, label: 'Ford', daily_limit: 50, phone: '+16462442696' },
] as const;

export const LINQ_API_BASE = 'https://api.linqapp.com/api/partner/v3';

export type QueueStatus = 'pending' | 'sent' | 'failed';

export interface OutreachQueueEntry {
  id: string;
  chapter_id: string;
  contact_id: string;
  line_number: number;
  queue_position: number;
  status: QueueStatus;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
  contact?: AlumniContact;
}

// ============================================
// Pipeline V2 Types
// ============================================

export interface School {
  id: string;
  name: string;
  state: string | null;
  conference: string | null;
  enrollment: number | null;
  total_greek_orgs: number | null;
  chapters_sold: number;
  alumni_estimated: number | null;
  alumni_onboarded: number;
  created_at: string;
  updated_at: string;
}

export interface NationalOrg {
  id: string;
  name: string;
  abbreviation: string | null;
  type: 'fraternity' | 'sorority';
  nic_npc: boolean;
  chapter_count: number | null;
  stage: 'prospect' | 'outreach' | 'demo' | 'negotiation' | 'contract_sent' | 'signed' | 'lost';
  value: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  school_id: string | null;
  national_org_id: string | null;
  name: string;
  type: 'chapter' | 'ifc' | 'phc' | 'club' | 'athletic';
  status: 'prospect' | 'active_customer' | 'churned' | 'hold';
  created_at: string;
  updated_at: string;
}

export interface PipelineContact {
  id: string;
  org_id: string | null;
  national_org_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  role: 'president' | 'advisor' | 'fsl_director' | 'nationals_rep' | 'alumni_chair' | 'board_member' | 'other' | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PipelineDeal {
  id: string;
  org_id: string | null;
  contact_id: string | null;
  assigned_to: string | null;
  deal_type: 'local' | 'council' | 'national';
  stage: DealStage;
  value: number;
  temperature: 'hot' | 'warm' | 'cold';
  next_followup: string | null;
  last_touched: string | null;
  followup_count: number;
  notes: string | null;
  conference: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// Chapter Member (Headhunting) Types
// ============================================

export type MemberStatus = 'looking' | 'in_progress' | 'placed' | 'not_tracking';

export const MEMBER_STATUS_CONFIG: Record<MemberStatus, { label: string; color: string; bg: string }> = {
  looking:      { label: 'Looking',     color: '#d97706', bg: '#fef3c7' },
  in_progress:  { label: 'In Progress', color: '#2563eb', bg: '#dbeafe' },
  placed:       { label: 'Placed 🎉',   color: '#16a34a', bg: '#dcfce7' },
  not_tracking: { label: 'Not Tracking',color: '#6b7280', bg: '#f3f4f6' },
};

export interface ChapterMember {
  id: string;
  chapter_id: string;
  name: string;
  grad_year: number | null;
  major: string | null;
  career_interest: string | null;
  status: MemberStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  member_type?: 'active' | 'alumni';
  job_role: string | null;
  company: string | null;
  is_hiring: boolean;
}
