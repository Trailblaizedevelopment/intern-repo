import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Get Started — Trailblaize',
  description: 'Set up your organization on Trailblaize. Alumni directory, message board, and engagement tools.',
};

export default function SetUpLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
