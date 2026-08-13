export interface ScoutConversation {
  id: string;
  phone_number: string;
  linq_line: '+16462101111' | '+16462668785' | '+16462442696';
  linq_chat_id: string;
  direction: 'inbound' | 'outbound';
  message_body: string;
  read: boolean;
  flagged: boolean;
  flag_reason: string | null;
  created_at: string;
}

export type ConversationStage =
  | 'intro_sent'
  | 'needs_goals'
  | 'needs_background'
  | 'needs_context'
  | 'ready_for_match'
  | 'active'
  | 'opted_out';

export interface ScoutProfile {
  id: string;
  phone_number: string;
  name: string;
  chapter: string;
  university: string;
  graduation_year: number;
  location: string;
  current_title: string;
  career_interest: string;
  goals: string[];
  skills: string[];
  looking_for: string;
  opt_in_status: 'opted_in' | 'opted_out' | 'pending';
  last_contact: string;
  next_followup: string | null;
  profile_complete: number;
  notes: string;
  conversation_stage?: ConversationStage | string;
}

export interface ScoutIntroduction {
  id: string;
  requester: ScoutProfile;
  target: ScoutProfile;
  reason: string;
  status: 'suggested' | 'pending_approval' | 'sent' | 'accepted' | 'declined';
  created_at: string;
  approved_by?: string | null;
  approved_at?: string | null;
}

export const SCOUT_LINES = [
  { phone: '+16462101111' as const, label: 'Owen', color: '#3b82f6', daily_limit: 50 },
  { phone: '+16462668785' as const, label: 'Adam', color: '#10b981', daily_limit: 50 },
  { phone: '+16462442696' as const, label: 'Ford', color: '#8b5cf6', daily_limit: 50 },
] as const;

export const CONVERSATION_STAGES: { value: ConversationStage; label: string }[] = [
  { value: 'intro_sent', label: 'Intro sent' },
  { value: 'needs_goals', label: 'Needs goals' },
  { value: 'needs_background', label: 'Needs background' },
  { value: 'needs_context', label: 'Needs context' },
  { value: 'ready_for_match', label: 'Ready for match' },
  { value: 'active', label: 'Active' },
  { value: 'opted_out', label: 'Opted out' },
];

export function getLineLabel(phone: string): string {
  return SCOUT_LINES.find(l => l.phone === phone)?.label ?? phone;
}

export function getLineColor(phone: string): string {
  return SCOUT_LINES.find(l => l.phone === phone)?.color ?? '#6b7280';
}
