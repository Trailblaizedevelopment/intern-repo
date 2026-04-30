import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Trailblaize — The Next Social Network',
  description: "Won't create connections, it will reveal them.",
  openGraph: {
    title: 'The Next Social Network',
    description: "Won't create connections, it will reveal them.",
    images: [{ url: '/og-waitlist.jpg', width: 1200, height: 1500 }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'The Next Social Network',
    description: "Won't create connections, it will reveal them.",
    images: ['/og-waitlist.jpg'],
  },
};

export default function WaitlistLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
