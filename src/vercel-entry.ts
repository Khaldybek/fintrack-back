import { createApp } from './app-factory';
import type { INestApplication } from '@nestjs/common';

let appCache: INestApplication | null = null;

async function getApp(): Promise<INestApplication> {
  if (appCache) return appCache;
  appCache = await createApp();
  return appCache;
}

function sendError(res: any, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('Vercel handler error:', msg, err instanceof Error ? err.stack : '');
  res.status(500).setHeader('Content-Type', 'application/json').end(
    JSON.stringify({
      statusCode: 500,
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'production' ? 'Internal error' : msg,
    }),
  );
}

/**
 * Единственная точка входа для Vercel (builds + routes).
 * Собирается в dist/vercel-entry.js. Все запросы приходят с оригинальным req.url.
 */
export default async function handler(req: any, res: any): Promise<void> {
  try {
    const app = await getApp();
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp(req, res);
  } catch (err) {
    sendError(res, err);
  }
}
