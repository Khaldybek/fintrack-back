import { join } from 'path';
import { existsSync } from 'fs';
import type { INestApplication } from '@nestjs/common';

let appCache: INestApplication | null = null;

async function getApp(): Promise<INestApplication> {
  if (appCache) return appCache;
  const factoryPath = join(process.cwd(), 'dist', 'app-factory.js');
  if (!existsSync(factoryPath)) {
    throw new Error('app-factory not found at: ' + factoryPath + ' (cwd: ' + process.cwd() + ')');
  }
  const { createApp } = require(factoryPath);
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
 * Vercel entry (builds + routes). Импорт из src — @vercel/node скомпилирует всё.
 * req.url сохраняет оригинальный путь при routes dest.
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
