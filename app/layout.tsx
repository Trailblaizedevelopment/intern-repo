import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trailblaize",
  description: "The private network for the people and places that matter.",
  keywords: ["alumni", "networking", "community", "organizations", "Trailblaize", "engagement", "growth", "social network"],
  authors: [{ name: "Trailblaize" }],
  metadataBase: new URL("https://trailblaize.space"),
  openGraph: {
    title: "Trailblaize",
    description: "The private network for the people and places that matter.",
    url: "https://trailblaize.space",
    siteName: "Trailblaize",
    images: [{ url: "/logos/logo-wordmark-on-navy.png", width: 1200, height: 630, alt: "Trailblaize" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Trailblaize",
    description: "The private network for the people and places that matter.",
    images: ["/logos/logo-wordmark-on-navy.png"],
  },
  icons: {
    icon: "/logos/logo-icon-white.png",
    shortcut: "/logos/logo-icon-white.png",
    apple: "/logos/logo-icon-white.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
