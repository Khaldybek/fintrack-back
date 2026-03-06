import '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { createApp } from './app-factory';

let appCache: INestApplication | null = null;

async function getApp(): Promise<INestApplication> {
  if (appCache) return appCache;
  appCache = await createApp();
  return appCache;
}

function getPathForNest(req: any): string {
  const rawUrl = (req.url as string) || '';
  // Already correct path when Vercel invokes this handler with original URL
  if (rawUrl.startsWith('/v1') || rawUrl === '/') return rawUrl;
  const q = rawUrl.indexOf('?');
  const query = q >= 0 ? rawUrl.slice(q + 1) : '';
  const pathParam = query.split('&').find((p: string) => p.startsWith('path='));
  if (pathParam) {
    const eq = pathParam.indexOf('=');
    const value = eq >= 0 ? pathParam.slice(eq + 1) : '';
    try {
      let decoded = decodeURIComponent(value).replace(/^\/+/, '/') || '/';
      if (decoded !== '/' && !decoded.startsWith('/')) decoded = '/' + decoded;
      const rest = query.split('&').filter((p: string) => !p.startsWith('path=')).join('&');
      return rest ? decoded + (decoded.includes('?') ? '&' : '?') + rest : decoded;
    } catch (_) {}
  }
  const forwarded = req.headers?.['x-vercel-forwarded-url'] || req.headers?.['x-forwarded-url'];
  if (forwarded) {
    try {
      const u = new URL(forwarded.startsWith('http') ? forwarded : 'https://x.com' + (forwarded.startsWith('/') ? forwarded : '/' + forwarded));
      return u.pathname + (u.search || '') || '/';
    } catch (_) {}
  }
  if (rawUrl.startsWith('/api')) return rawUrl.replace(/^\/api/, '') || '/';
  return rawUrl || '/';
}

/** Vercel serverless entry: export so "No exports found" is resolved when Framework Preset uses main.js */
export default async function handler(req: any, res: any): Promise<void> {
  req.url = getPathForNest(req);
  const app = await getApp();
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp(req, res);
}

async function bootstrap(): Promise<void> {
  const app = await getApp();
  await app.listen(process.env.PORT ?? 3000);
}

if (process.env.VERCEL !== '1') {
  bootstrap();
}
