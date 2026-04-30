import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = "The Next Social Network — Won't create connections, it will reveal them.";
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  // Fetch the flyer image and use it as background
  const imageData = await fetch(new URL('/og-waitlist.jpg', 'https://trailblaize.space')).then(
    (res) => res.arrayBuffer()
  ).catch(() => null);

  if (imageData) {
    // Return the image directly
    return new Response(imageData, {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
  }

  // Fallback: generate OG image with text
  return new ImageResponse(
    (
      <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0a0a' }}>
        <div style={{ fontSize: 64, fontWeight: 700, color: '#ffffff', textAlign: 'center', lineHeight: 1.2, fontFamily: 'Georgia, serif' }}>
          The Next Social Network
        </div>
        <div style={{ fontSize: 28, color: 'rgba(255, 255, 255, 0.6)', marginTop: 24, textAlign: 'center', fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
          Won't create connections, it will reveal them.
        </div>
      </div>
    ),
    { ...size }
  );
}
