/**
 * GET /api/avatar-proxy?url=<encoded_url>
 *
 * Proxies external avatar images (Google, Supabase Storage, LinkedIn, etc.)
 * to avoid CORS / referrer restrictions in the browser.
 * Caches response for 1 hour.
 */

import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_HOSTS = [
  'lh3.googleusercontent.com',
  'lh4.googleusercontent.com',
  'ssqpfkiesxwnmphwyezb.supabase.co',
  'media.licdn.com',
  'avatars.githubusercontent.com',
  'pbs.twimg.com',
];

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('url');
  if (!raw) return new NextResponse('Missing url', { status: 400 });

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return new NextResponse('Invalid url', { status: 400 });
  }

  if (!ALLOWED_HOSTS.includes(url.hostname)) {
    return new NextResponse('Host not allowed', { status: 403 });
  }

  try {
    const res = await fetch(raw, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Trailblaize/1.0)',
        'Referer': 'https://trailblaize.space/',
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) return new NextResponse('Upstream error', { status: res.status });

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const buffer = await res.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch {
    return new NextResponse('Fetch failed', { status: 502 });
  }
}
