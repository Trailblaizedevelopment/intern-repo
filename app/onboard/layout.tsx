import type { Metadata } from "next";

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
  return children;
}
