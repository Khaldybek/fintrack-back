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
