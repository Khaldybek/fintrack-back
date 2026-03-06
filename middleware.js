import { NextResponse } from 'next/server';

/**
 * Edge middleware: rewrite all requests to /api?path=<pathname>
 * so the Node handler (api/index.js) always receives the path in query.
 * Fixes 404 on /v1/... when vercel.json rewrite doesn't apply (e.g. production).
 */
export function middleware(request) {
  const url = new URL(request.url);
  const pathname = url.pathname || '/';
  const api = new URL('/api', request.url);
  api.searchParams.set('path', pathname);
  return NextResponse.rewrite(api);
}

export const config = {
  matcher: ['/((?!api).*)'],
};
