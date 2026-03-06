/**
 * Edge middleware: proxy all non-/api requests to /api?path=<pathname>
 * so the Node handler always receives the path. Fixes 404 on /v1/... when
 * vercel.json rewrite doesn't apply (e.g. production domain).
 */
export default async function middleware(request) {
  const url = new URL(request.url);
  const pathname = url.pathname || '/';
  const apiUrl = new URL(request.url);
  apiUrl.pathname = '/api';
  apiUrl.searchParams.set('path', pathname);
  const res = await fetch(apiUrl.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
  });
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

export const config = {
  matcher: ['/((?!api).*)'],
};
