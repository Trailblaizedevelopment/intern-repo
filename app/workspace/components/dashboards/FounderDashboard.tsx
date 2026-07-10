'use client';

import React, { useMemo } from 'react';
import { Calendar, Mail } from 'lucide-react';
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
 * Flat, full-width layout: no nested cards or grey backdrop.
 */
export function FounderDashboard({ data, teamMembers }: FounderDashboardProps) {
  const { currentEmployee } = data;
  const google = useGoogleIntegration(currentEmployee?.id);

  const todayEventCount = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return google.calendarEvents.filter((event) => {
      const start = event.start.dateTime || event.start.date || '';
      return start.startsWith(todayStr);
    }).length;
  }, [google.calendarEvents]);

  return (
    <div className="fd-dashboard">
      <section className="fd-section fd-section--calendar" aria-label="Calendar">
        <header className="fd-section-header">
          <div className="fd-section-title">
            <span className="fd-section-icon" aria-hidden="true">
              <Calendar size={18} />
            </span>
            <h2>Calendar</h2>
            {google.status?.connected && todayEventCount > 0 && (
              <span className="fd-section-badge fd-section-badge--muted">
                {todayEventCount} today
              </span>
            )}
          </div>
        </header>

        <TrailblaizeCalendar
          events={google.calendarEvents}
          loading={google.calendarLoading}
          connected={google.status?.connected || false}
          onConnect={google.connect}
          onRefresh={google.fetchCalendarEvents}
        />
      </section>

      <div className="fd-divider" role="separator" aria-hidden="true" />

      <section className="fd-section fd-section--inbox" aria-label="Inbox">
        <header className="fd-section-header">
          <div className="fd-section-title">
            <span className="fd-section-icon" aria-hidden="true">
              <Mail size={18} />
            </span>
            <h2>Inbox</h2>
            {google.status?.connected && google.unreadCount > 0 && (
              <span className="fd-section-badge">{google.unreadCount}</span>
            )}
          </div>
        </header>

        <InboxEmbed google={google} currentEmployee={currentEmployee} />
      </section>
    </div>
  );
}
