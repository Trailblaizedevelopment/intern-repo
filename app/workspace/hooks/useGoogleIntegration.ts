import { useState, useEffect, useCallback } from 'react';

interface GoogleStatus {
  connected: boolean;
  isExpired: boolean;
  scopes: string[];
  hasCalendar: boolean;
  hasGmail: boolean;
}

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  htmlLink: string;
  attendees?: Array<{ email: string; displayName?: string }>;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  fromEmail: string;
  to?: string;
  body?: string;
  date: string;
  snippet: string;
  isUnread: boolean;
}

export interface ThreadMessage extends GmailMessage {
  body: string;
  to: string;
}

interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  threadId?: string;
}

interface ContactEmail extends GmailMessage {
  to: string;
  body: string;
}

export const GMAIL_FETCH_LIMIT = 50;

interface UseGoogleIntegrationReturn {
  // Status
  status: GoogleStatus | null;
  loading: boolean;
  error: string | null;
  
  // Calendar
  calendarEvents: CalendarEvent[];
  calendarLoading: boolean;
  fetchCalendarEvents: () => Promise<void>;
  
  // Gmail
  emails: GmailMessage[];
  unreadCount: number;
  gmailLoading: boolean;
  hasMoreEmails: boolean;
  emailFetchLimit: number;
  fetchEmails: () => Promise<void>;
  fetchThread: (threadId: string) => Promise<ThreadMessage[] | null>;
  sendEmail: (params: SendEmailParams) => Promise<{ success: boolean; error?: string }>;
  sendingEmail: boolean;

  // Contact Emails
  fetchEmailsForContact: (contactEmail: string) => Promise<ContactEmail[]>;
  
  // Actions
  connect: () => void;
  disconnect: () => Promise<void>;
  refreshStatus: () => Promise<void>;
}

export function useGoogleIntegration(employeeId: string | undefined): UseGoogleIntegrationReturn {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  
  const [emails, setEmails] = useState<GmailMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [hasMoreEmails, setHasMoreEmails] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  // Check connection status
  const refreshStatus = useCallback(async () => {
    if (!employeeId) return;
    
    try {
      const response = await fetch(`/api/google/status?employee_id=${employeeId}`);
      const data = await response.json();
      
      if (response.ok) {
        setStatus(data);
        setError(null);
      } else {
        setStatus({ connected: false, isExpired: false, scopes: [], hasCalendar: false, hasGmail: false });
      }
    } catch (err) {
      console.error('Failed to fetch Google status:', err);
      setStatus({ connected: false, isExpired: false, scopes: [], hasCalendar: false, hasGmail: false });
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  // Fetch calendar events
  const fetchCalendarEvents = useCallback(async () => {
    if (!employeeId || !status?.connected) return;
    
    setCalendarLoading(true);
    try {
      const response = await fetch(`/api/google/calendar?employee_id=${employeeId}&days=7&max=10`);
      const data = await response.json();
      
      if (response.ok) {
        setCalendarEvents(data.events || []);
      } else if (data.code === 'NOT_CONNECTED') {
        setStatus(prev => prev ? { ...prev, connected: false } : null);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      console.error('Failed to fetch calendar:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch calendar events');
    } finally {
      setCalendarLoading(false);
    }
  }, [employeeId, status?.connected]);

  // Fetch emails
  const fetchEmails = useCallback(async () => {
    if (!employeeId || !status?.connected) return;

    setGmailLoading(true);
    try {
      const response = await fetch(`/api/google/gmail?employee_id=${employeeId}&max=${GMAIL_FETCH_LIMIT}`);
      const data = await response.json();

      if (response.ok) {
        const fetchedEmails: GmailMessage[] = data.emails || [];
        setEmails(fetchedEmails);
        setUnreadCount(data.unreadCount || 0);
        const totalEstimate = typeof data.totalEstimate === 'number' ? data.totalEstimate : null;
        setHasMoreEmails(
          fetchedEmails.length >= GMAIL_FETCH_LIMIT
          || (totalEstimate !== null && totalEstimate > fetchedEmails.length)
          || (data.unreadCount || 0) > fetchedEmails.length
        );
      } else if (data.code === 'NOT_CONNECTED') {
        setStatus(prev => (prev ? { ...prev, connected: false } : null));
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      console.error('Failed to fetch emails:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch emails');
    } finally {
      setGmailLoading(false);
    }
  }, [employeeId, status?.connected]);

  // Fetch full thread for chat-style view
  const fetchThread = useCallback(
    async (threadId: string): Promise<ThreadMessage[] | null> => {
      if (!employeeId || !status?.connected) return null;
      try {
        const response = await fetch(
          `/api/google/gmail/thread/${threadId}?employee_id=${employeeId}`
        );
        const data = await response.json();
        if (response.ok) return data.messages || [];
        return null;
      } catch (err) {
        console.error('Failed to fetch thread:', err);
        return null;
      }
    },
    [employeeId, status?.connected]
  );

  // Connect Google account
  const connect = useCallback(() => {
    if (!employeeId) return;
    
    // Open OAuth flow in a popup or redirect
    window.location.href = `/api/google/auth?employee_id=${employeeId}`;
  }, [employeeId]);

  // Disconnect Google account
  const disconnect = useCallback(async () => {
    if (!employeeId) return;
    
    try {
      const response = await fetch('/api/google/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId }),
      });
      
      if (response.ok) {
        setStatus({ connected: false, isExpired: false, scopes: [], hasCalendar: false, hasGmail: false });
        setCalendarEvents([]);
        setEmails([]);
        setUnreadCount(0);
        setHasMoreEmails(false);
      }
    } catch (err) {
      console.error('Failed to disconnect:', err);
      setError('Failed to disconnect Google account');
    }
  }, [employeeId]);

  // Send email via Gmail
  const sendEmail = useCallback(async (params: SendEmailParams): Promise<{ success: boolean; error?: string }> => {
    if (!employeeId || !status?.connected) {
      return { success: false, error: 'Not connected to Gmail' };
    }
    
    setSendingEmail(true);
    try {
      const response = await fetch('/api/google/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId,
          ...params,
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        // Refresh emails to show the sent email
        await fetchEmails();
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Failed to send email' };
      }
    } catch (err) {
      console.error('Failed to send email:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Failed to send email' };
    } finally {
      setSendingEmail(false);
    }
  }, [employeeId, status?.connected, fetchEmails]);

  // Fetch emails for a specific contact
  const fetchEmailsForContact = useCallback(async (contactEmail: string): Promise<ContactEmail[]> => {
    if (!employeeId || !status?.connected || !contactEmail) {
      return [];
    }
    
    try {
      // Gmail query to find emails from or to this contact
      const query = encodeURIComponent(`from:${contactEmail} OR to:${contactEmail}`);
      const response = await fetch(`/api/google/gmail?employee_id=${employeeId}&max=20&q=${query}`);
      const data = await response.json();
      
      if (response.ok) {
        return data.emails || [];
      } else if (data.code === 'NOT_CONNECTED') {
        setStatus(prev => prev ? { ...prev, connected: false } : null);
      }
      return [];
    } catch (err) {
      console.error('Failed to fetch contact emails:', err);
      return [];
    }
  }, [employeeId, status?.connected]);

  // Initial status check
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Fetch data when connected (API will handle token refresh if expired)
  useEffect(() => {
    if (status?.connected) {
      // Always try to fetch - the API endpoints will refresh expired tokens
      // If refresh fails, the API returns NOT_CONNECTED and we update status
      fetchCalendarEvents();
      fetchEmails();
    }
  }, [status?.connected, fetchCalendarEvents, fetchEmails]);

  // Check for OAuth callback success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('google_connected') === 'true') {
      refreshStatus();
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [refreshStatus]);

  return {
    status,
    loading,
    error,
    calendarEvents,
    calendarLoading,
    fetchCalendarEvents,
    emails,
    unreadCount,
    gmailLoading,
    hasMoreEmails,
    emailFetchLimit: GMAIL_FETCH_LIMIT,
    fetchEmails,
    fetchThread,
    sendEmail,
    sendingEmail,
    fetchEmailsForContact,
    connect,
    disconnect,
    refreshStatus,
  };
}
