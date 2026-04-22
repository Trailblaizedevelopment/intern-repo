'use client';

import React from 'react';
import { Mail } from 'lucide-react';
import { TrailblaizeCalendar } from '../TrailblaizeCalendar';
import { InboxEmbed } from '../InboxEmbed';
import { UseWorkspaceDataReturn } from '../../hooks/useWorkspaceData';
import { useGoogleIntegration } from '../../hooks/useGoogleIntegration';
import { Employee } from '@/lib/supabase';

interface FounderDashboardProps {
  data: UseWorkspaceDataReturn;
  teamMembers: Employee[];
}

/**
 * Founder Dashboard — Calendar + Inbox only.
 * Clean, focused view: what's on the calendar and what's in the inbox.
 */
export function FounderDashboard({ data, teamMembers }: FounderDashboardProps) {
  const { currentEmployee } = data;

  const google = useGoogleIntegration(currentEmployee?.id);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        background: '#F9FAFB',
        minHeight: '100vh',
        padding: '24px',
      }}
    >
      {/* ── Calendar ── */}
      <section
        style={{
          background: '#ffffff',
          border: '1px solid #E5E7EB',
          borderRadius: 16,
          padding: '24px',
          marginBottom: 24,
        }}
      >
        <TrailblaizeCalendar
          events={google.calendarEvents}
          loading={google.calendarLoading}
          connected={google.status?.connected || false}
          onConnect={google.connect}
          onRefresh={google.fetchCalendarEvents}
        />
      </section>

      {/* ── Divider ── */}
      <div
        style={{
          height: 1,
          background: '#E5E7EB',
          marginBottom: 24,
        }}
      />

      {/* ── Inbox ── */}
      <section
        style={{
          background: '#ffffff',
          border: '1px solid #E5E7EB',
          borderRadius: 16,
          padding: '24px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 20,
          }}
        >
          <Mail size={20} style={{ color: '#0F172A' }} />
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 600,
              color: '#111827',
            }}
          >
            Inbox
          </h2>
          {google.status?.connected && google.unreadCount > 0 && (
            <span
              style={{
                background: '#0F172A',
                color: '#ffffff',
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 7px',
                borderRadius: 99,
                lineHeight: 1.5,
              }}
            >
              {google.unreadCount}
            </span>
          )}
        </div>

        <InboxEmbed google={google} currentEmployee={currentEmployee} />
      </section>
    </div>
  );
}
