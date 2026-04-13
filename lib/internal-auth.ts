/**
 * Internal API auth header for client-side fetch calls to /api/* routes.
 *
 * The key must match INTERNAL_API_KEY in server-side env.
 * Centralised here so key rotation is a single change.
 *
 * NOTE: This key is included in the client JS bundle. It guards internal routes
 * from casual abuse — not from determined attackers with access to the bundle.
 * Treat it as a rate-limit / abuse-prevention layer, not a security boundary.
 */
export const INTERNAL_API_KEY = process.env.NEXT_PUBLIC_INTERNAL_API_KEY ?? 'hvfv81fuy3vi76f23uyvdo834634gy1o87234grb1347d63o48tfgv23uf4234g535g443hb2345h';
export const INTERNAL_AUTH_HEADER = `Bearer ${INTERNAL_API_KEY}`;
