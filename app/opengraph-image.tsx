import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Trailblaize — The private network for your organization';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F172A' }}>
        {/* Flag icon */}
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 32 }}>
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
          <line x1="4" y1="22" x2="4" y2="15"/>
        </svg>

        <div style={{ fontSize: 64, fontWeight: 700, color: '#ffffff', textAlign: 'center', lineHeight: 1.2, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          Trailblaize
        </div>

        <div style={{ fontSize: 28, color: 'rgba(255, 255, 255, 0.6)', marginTop: 24, textAlign: 'center', maxWidth: 800, lineHeight: 1.5, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          The private network for the people and places that matter.
        </div>
      </div>
    ),
    { ...size }
  );
}
