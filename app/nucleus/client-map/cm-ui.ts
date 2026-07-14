import type React from 'react';

export const CM_UI = {
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
  border: `1px solid ${CM_UI.border}`,
  background: '#fff',
  color: CM_UI.textSecondary,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
};

export const TOOLBAR_BUTTON_PRIMARY: React.CSSProperties = {
  ...TOOLBAR_BUTTON,
  border: 'none',
  background: CM_UI.ink,
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

export const TOOLBAR_SEARCH: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  height: TOOLBAR_CONTROL_HEIGHT,
  padding: '0 12px',
  borderRadius: '9999px',
  border: `1px solid ${CM_UI.border}`,
  background: '#fff',
  flex: 1,
  minWidth: 0,
};

export const SECTION_TITLE: React.CSSProperties = {
  margin: '0 0 4px',
  fontSize: '0.875rem',
  fontWeight: 600,
  color: CM_UI.text,
};

export const CM_CARD: React.CSSProperties = {
  background: CM_UI.surface,
  border: `1px solid ${CM_UI.border}`,
  borderRadius: 12,
};

export const DRAWER_LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: '0.6875rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: CM_UI.textMuted,
  marginBottom: 8,
};

export const DRAWER_INPUT: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  fontSize: '0.8125rem',
  padding: '9px 12px',
  border: `1px solid ${CM_UI.border}`,
  borderRadius: 10,
  outline: 'none',
  fontFamily: 'inherit',
  color: CM_UI.text,
  background: '#fff',
};
