import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trailblaize",
  description: "Alumni relationship management for Greek life chapters.",
  keywords: ["alumni", "networking", "community", "organizations", "Trailblaize", "engagement", "growth"],
  authors: [{ name: "Trailblaize" }],
  metadataBase: new URL("https://trailblaize.space"),
  openGraph: {
    title: "Trailblaize",
    description: "Alumni relationship management for Greek life chapters.",
    url: "https://trailblaize.space",
    siteName: "Trailblaize",
    images: [{ url: "/logos/logo-wordmark-color.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Trailblaize",
    description: "Alumni relationship management for Greek life chapters.",
    images: ["/logos/logo-wordmark-color.png"],
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
