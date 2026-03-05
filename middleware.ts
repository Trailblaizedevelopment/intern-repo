import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that never need an API key (webhooks, public onboarding, avatar proxy)
const PUBLIC_API_PREFIXES = [
  '/api/webhooks/',
  '/api/onboarding/',
  '/api/avatar-proxy',
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Legacy redirect: /portal → /workspace ──────────────────────────────
  if (pathname === '/portal' || pathname.startsWith('/portal/')) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.replace('/portal', '/workspace');
    return NextResponse.redirect(url, 301);
  }

  // ── API key auth for /api/* routes ─────────────────────────────────────
  if (pathname.startsWith('/api/')) {
    // Always allow public API routes
    if (PUBLIC_API_PREFIXES.some(p => pathname.startsWith(p))) {
      return NextResponse.next();
    }

    const apiKey = process.env.INTERNAL_API_KEY;

    // If no key is configured, allow through (dev mode / not set up yet)
    if (!apiKey) return NextResponse.next();

    // Allow browser sessions: Supabase sets sb-* cookies on login
    const hasBrowserSession = [...req.cookies.getAll()].some(c =>
      c.name.startsWith('sb-') || c.name === 'supabase-auth-token'
    );
    if (hasBrowserSession) return NextResponse.next();

    // Check for API key in Authorization header or x-api-key header
    const authHeader = req.headers.get('authorization') || '';
    const xApiKey    = req.headers.get('x-api-key') || '';
    const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : xApiKey;

    if (token !== apiKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/portal/:path*',
    '/api/:path*',
  ],
};
