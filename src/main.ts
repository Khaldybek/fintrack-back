import '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { createApp } from './app-factory';

let appCache: INestApplication | null = null;

async function getApp(): Promise<INestApplication> {
  if (appCache) return appCache;
  appCache = await createApp();
  return appCache;
}

/** Vercel serverless entry: export so "No exports found" is resolved when Framework Preset uses main.js */
export default async function handler(req: any, res: any): Promise<void> {
  // Rewrite sends path in ?path=/$1 so Vercel always hits /api. Restore path for Nest.
  const rawUrl = (req.url as string) || '';
  const q = rawUrl.indexOf('?');
  const query = q >= 0 ? rawUrl.slice(q + 1) : '';
  const pathParam = query.split('&').find((p: string) => p.startsWith('path='));
  if (pathParam) {
    const decoded = decodeURIComponent(pathParam.slice(5)).replace(/^\/+/, '/') || '/';
    const rest = query.split('&').filter((p: string) => !p.startsWith('path=')).join('&');
    req.url = rest ? decoded + (decoded.includes('?') ? '&' : '?') + rest : decoded;
  } else if (rawUrl.startsWith('/api')) {
    req.url = rawUrl.replace(/^\/api/, '') || '/';
  }
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
