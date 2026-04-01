import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Finance — Trailblaize',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#0a0a0f', minHeight: '100vh', overflowX: 'hidden' }}>
      {children}
    </div>
  );
}
