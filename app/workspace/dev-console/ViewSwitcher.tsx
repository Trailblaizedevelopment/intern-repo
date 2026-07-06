'use client';

import React from 'react';
import { BarChart3, BookOpen, Sparkles } from 'lucide-react';

export type ConsoleView = 'dashboard' | 'brain-room' | 'guide';

const VIEWS: { id: ConsoleView; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Ops', icon: BarChart3 },
  { id: 'brain-room', label: 'Room', icon: Sparkles },
  { id: 'guide', label: 'Guide', icon: BookOpen },
];

interface ViewSwitcherProps {
  value: ConsoleView;
  onChange: (view: ConsoleView) => void;
  className?: string;
}

export function ViewSwitcher({ value, onChange, className }: ViewSwitcherProps) {
  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        padding: 3,
        borderRadius: 10,
        background: '#F3F4F6',
        border: '1px solid #E5E7EB',
        gap: 2,
      }}
    >
      {VIEWS.map(v => {
        const Icon = v.icon;
        const active = value === v.id;
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onChange(v.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 10px',
              borderRadius: 7,
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.6875rem',
              fontWeight: active ? 600 : 500,
              background: active ? 'white' : 'transparent',
              color: active ? '#4338CA' : '#6B7280',
              boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              transition: 'background 0.15s, color 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            <Icon size={13} />
            {v.label}
          </button>
        );
      })}
    </div>
  );
}

export function loadSavedView(): ConsoleView {
  if (typeof window === 'undefined') return 'dashboard';
  const saved = localStorage.getItem('brain-console-view');
  if (saved === 'dashboard' || saved === 'brain-room' || saved === 'guide') return saved;
  return 'dashboard';
}

export function saveView(view: ConsoleView): void {
  localStorage.setItem('brain-console-view', view);
}
