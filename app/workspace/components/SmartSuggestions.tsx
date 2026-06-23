'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import {
  Zap,
  TrendingUp,
  Users,
  Mail,
  Phone,
  CheckSquare,
  GitPullRequest,
  Bug,
  Target,
  MessageSquare,
  FileText,
  Clock,
  Star,
  ArrowRight,
  Sparkles,
  Coffee,
  Rocket
} from 'lucide-react';

type WorkspaceRole = 'founder' | 'engineer' | 'growth_intern';

interface Suggestion {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  href: string;
  color: string;
  priority: 'high' | 'medium' | 'low';
}

interface SmartSuggestionsProps {
  role: WorkspaceRole;
  isInMeeting: boolean;
  minutesUntilNext: number | null;
  stats?: {
    openTasks?: number;
    overdueItems?: number;
    unreadMessages?: number;
    activeLeads?: number;
    pendingFollowups?: number;
  };
}

export function SmartSuggestions({
  role,
  isInMeeting,
  minutesUntilNext,
  stats = {}
}: SmartSuggestionsProps) {
  // Determine available time context
  const timeContext = useMemo(() => {
    if (isInMeeting) return 'in_meeting';
    if (minutesUntilNext === null) return 'free_day';
    if (minutesUntilNext <= 5) return 'about_to_start';
    if (minutesUntilNext <= 15) return 'short_break';
    if (minutesUntilNext <= 30) return 'medium_break';
    return 'long_break';
  }, [isInMeeting, minutesUntilNext]);

  // Generate role-specific suggestions based on context
  const suggestions = useMemo((): Suggestion[] => {
    const allSuggestions: Record<WorkspaceRole, Suggestion[]> = {
      founder: [
        {
          id: 'review-pipeline',
          title: 'Review Sales Pipeline',
          description: 'Check deal progress and upcoming closes',
          icon: TrendingUp,
          href: '/nucleus/war-room',
          color: '#f59e0b',
          priority: 'high'
        },
        {
          id: 'team-updates',
          title: 'Check Team Updates',
          description: 'See what your team accomplished',
          icon: Users,
          href: '/workspace/team',
          color: '#3b82f6',
          priority: 'medium'
        },
        {
          id: 'follow-up-leads',
          title: 'Follow Up on Hot Leads',
          description: stats.pendingFollowups ? `${stats.pendingFollowups} contacts need attention` : 'Review your hot contacts',
          icon: Phone,
          href: '/nucleus/fundraising',
          color: '#ef4444',
          priority: stats.pendingFollowups ? 'high' : 'medium'
        },
        {
          id: 'review-metrics',
          title: 'Review Company Metrics',
          description: 'MRR, pipeline, and growth stats',
          icon: Target,
          href: '/nucleus',
          color: '#10b981',
          priority: 'medium'
        },
        {
          id: 'customer-health',
          title: 'Check Customer Health',
          description: 'Review chapter onboarding status',
          icon: Star,
          href: '/nucleus/customer-success',
          color: '#ec4899',
          priority: 'medium'
        },
        {
          id: 'strategic-planning',
          title: 'Strategic Planning',
          description: 'Review and update company goals',
          icon: Rocket,
          href: '/workspace/whiteboard',
          color: '#8b5cf6',
          priority: 'low'
        }
      ],
      engineer: [
        {
          id: 'review-prs',
          title: 'Review Open PRs',
          description: 'Check pull requests waiting for review',
          icon: GitPullRequest,
          href: '/workspace/tasks',
          color: '#8b5cf6',
          priority: 'high'
        },
        {
          id: 'check-bugs',
          title: 'Check Bug Queue',
          description: 'Review and prioritize reported issues',
          icon: Bug,
          href: '/workspace/tasks',
          color: '#ef4444',
          priority: 'high'
        },
        {
          id: 'sprint-tasks',
          title: 'Update Sprint Tasks',
          description: stats.openTasks ? `${stats.openTasks} tasks in progress` : 'Review your current sprint',
          icon: CheckSquare,
          href: '/workspace/tasks',
          color: '#10b981',
          priority: 'medium'
        },
        {
          id: 'team-sync',
          title: 'Team Sync',
          description: 'Check messages from teammates',
          icon: MessageSquare,
          href: '/workspace/inbox',
          color: '#3b82f6',
          priority: 'medium'
        },
        {
          id: 'documentation',
          title: 'Update Documentation',
          description: 'Review and improve docs',
          icon: FileText,
          href: '/workspace/whiteboard',
          color: '#f59e0b',
          priority: 'low'
        }
      ],
      growth_intern: [
        {
          id: 'log-outreach',
          title: 'Log Outreach Activity',
          description: 'Record your latest contact attempts',
          icon: Phone,
          href: '/workspace/leads',
          color: '#10b981',
          priority: 'high'
        },
        {
          id: 'update-leads',
          title: 'Update Lead Status',
          description: stats.activeLeads ? `${stats.activeLeads} leads to review` : 'Keep your pipeline current',
          icon: Target,
          href: '/workspace/leads',
          color: '#f59e0b',
          priority: 'high'
        },
        {
          id: 'daily-tasks',
          title: 'Complete Daily Tasks',
          description: stats.openTasks ? `${stats.openTasks} tasks remaining` : 'Check your task list',
          icon: CheckSquare,
          href: '/workspace/tasks',
          color: '#3b82f6',
          priority: 'medium'
        },
        {
          id: 'check-inbox',
          title: 'Check Messages',
          description: stats.unreadMessages ? `${stats.unreadMessages} unread` : 'Stay on top of communications',
          icon: Mail,
          href: '/workspace/inbox',
          color: '#8b5cf6',
          priority: stats.unreadMessages ? 'high' : 'low'
        },
        {
          id: 'research-prospects',
          title: 'Research Prospects',
          description: 'Find new contacts to reach out to',
          icon: Users,
          href: '/nucleus/fundraising',
          color: '#ec4899',
          priority: 'low'
        }
      ]
    };

    let roleSuggestions = allSuggestions[role] || allSuggestions.founder;

    // Filter and prioritize based on time context
    switch (timeContext) {
      case 'in_meeting':
        // Don't show suggestions during meetings
        return [];
      case 'about_to_start':
        // Only show quick actions
        return roleSuggestions.filter(s => s.priority === 'high').slice(0, 2);
      case 'short_break':
        // Show high priority only
        return roleSuggestions.filter(s => s.priority === 'high').slice(0, 3);
      case 'medium_break':
        // Show high and medium priority
        return roleSuggestions.filter(s => s.priority !== 'low').slice(0, 4);
      case 'long_break':
      case 'free_day':
      default:
        // Show all suggestions
        return roleSuggestions.slice(0, 5);
    }
  }, [role, timeContext, stats]);

  // Context message
  const contextMessage = useMemo(() => {
    switch (timeContext) {
      case 'in_meeting':
        return null;
      case 'about_to_start':
        return { icon: Clock, text: 'Quick actions before your meeting' };
      case 'short_break':
        return { icon: Zap, text: 'You have a few minutes' };
      case 'medium_break':
        return { icon: Coffee, text: 'Good time for focused work' };
      case 'long_break':
        return { icon: Sparkles, text: 'Great time for deep work' };
      case 'free_day':
        return { icon: Rocket, text: 'Your day is open—make it count' };
      default:
        return { icon: Zap, text: 'Suggested actions' };
    }
  }, [timeContext]);

  if (suggestions.length === 0 || !contextMessage) {
    return null;
  }

  return (
    <div className="smart-suggestions">
      <div className="smart-suggestions-header">
        <div className="suggestions-context">
          <contextMessage.icon size={16} />
          <span>{contextMessage.text}</span>
        </div>
      </div>
      <div className="smart-suggestions-grid">
        {suggestions.map(suggestion => (
          <Link
            key={suggestion.id}
            href={suggestion.href}
            className="suggestion-card"
          >
            <div 
              className="suggestion-icon"
              style={{ backgroundColor: `${suggestion.color}15`, color: suggestion.color }}
            >
              <suggestion.icon size={18} />
            </div>
            <div className="suggestion-content">
              <span className="suggestion-title">{suggestion.title}</span>
              <span className="suggestion-description">{suggestion.description}</span>
            </div>
            <ArrowRight size={14} className="suggestion-arrow" />
          </Link>
        ))}
      </div>
    </div>
  );
}
