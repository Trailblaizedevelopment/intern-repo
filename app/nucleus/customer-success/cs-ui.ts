import type React from 'react';

export const CS_UI = {
  border: '#e5e7eb',
  surface: '#ffffff',
  surfaceMuted: '#f9fafb',
  pageBg: '#f9fafb',
  text: '#111827',
  textSecondary: '#374151',
  textMuted: '#6b7280',
  textSubtle: '#9ca3af',
  blue: '#2563eb',
  blueDark: '#1d4ed8',
  blueBg: '#eff6ff',
  ink: '#0F172A',
  danger: '#dc2626',
  warning: '#d97706',
  success: '#059669',
};

export const NEUTRAL_BADGE = { color: '#374151', bg: '#f9fafb', border: '#e5e7eb' };

export const TIER_CONFIG = {
  red: { color: '#dc2626', bg: '#fef2f2', border: '#fecaca', label: 'Needs Attention' },
  yellow: { color: '#d97706', bg: '#fffbeb', border: '#fde68a', label: 'At Risk' },
  green: { color: '#059669', bg: '#ecfdf5', border: '#6ee7b7', label: 'Healthy' },
};

export const TOOLBAR_CONTROL_HEIGHT = 34;

export const TOOLBAR_BUTTON: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  height: TOOLBAR_CONTROL_HEIGHT,
  padding: '0 12px',
  fontSize: '0.8125rem',
  fontWeight: 500,
  borderRadius: '9999px',
  border: `1px solid ${CS_UI.border}`,
  background: '#fff',
  color: CS_UI.textSecondary,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
};

export const TOOLBAR_BUTTON_PRIMARY: React.CSSProperties = {
  ...TOOLBAR_BUTTON,
  border: 'none',
  background: CS_UI.ink,
  color: '#fff',
  fontWeight: 600,
};

export const LIST_PILL: React.CSSProperties = {
  fontSize: '0.68rem',
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: 9999,
  justifySelf: 'start',
  whiteSpace: 'nowrap',
};

export const DETAIL_PILL: React.CSSProperties = {
  fontSize: '0.68rem',
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: 9999,
  whiteSpace: 'nowrap',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  flexShrink: 0,
};

export const TOOLBAR_SEARCH: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  height: TOOLBAR_CONTROL_HEIGHT,
  padding: '0 12px',
  borderRadius: '9999px',
  border: `1px solid ${CS_UI.border}`,
  background: '#fff',
  flex: 1,
  minWidth: 0,
};

export const SECTION_TITLE: React.CSSProperties = {
  margin: '0 0 12px',
  fontSize: '0.875rem',
  fontWeight: 600,
  color: CS_UI.text,
};

export const CS_CARD: React.CSSProperties = {
  background: CS_UI.surface,
  border: `1px solid ${CS_UI.border}`,
  borderRadius: 12,
};
