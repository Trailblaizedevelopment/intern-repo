import type { Metadata } from "next";
import Head from 'next/head';

export const metadata: Metadata = {
  title: "Trailblaize — Chapter Submission",
  description: "Alumni relationship management for Greek life chapters.",
  openGraph: {
    title: "Trailblaize — Chapter Submission",
    description: "Alumni relationship management for Greek life chapters.",
    url: "https://trailblaize.space",
    siteName: "Trailblaize",
    images: [{ url: "/logos/logo-wordmark-color.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Trailblaize — Chapter Submission",
    description: "Alumni relationship management for Greek life chapters.",
    images: ["/logos/logo-wordmark-color.png"],
  },
  icons: {
    icon: "/logos/logo-icon-white.png",
    shortcut: "/logos/logo-icon-white.png",
    apple: "/logos/logo-icon-white.png",
  },
};

export default function OnboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </head>
      {children}
    </>
  );
}
