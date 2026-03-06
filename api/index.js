'use strict';

const path = require('path');
const fs = require('fs');

let appCache = null;

function getFactoryPath() {
  return path.join(process.cwd(), 'dist', 'app-factory.js');
}

function sendError(res, err) {
  const msg = err && (err.message || String(err));
  const stack = err && err.stack;
  console.error('Vercel handler error:', msg, stack || '');
  const body = {
    statusCode: 500,
    error: 'Internal Server Error',
    message: msg,
    stack: process.env.VERCEL_DEBUG ? stack : undefined,
  };
  res.status(500).setHeader('Content-Type', 'application/json').end(JSON.stringify(body));
}

async function getApp() {
  if (appCache) return appCache;
  const factoryPath = getFactoryPath();
  if (!fs.existsSync(factoryPath)) {
    throw new Error('app-factory not found at: ' + factoryPath + ' (cwd: ' + process.cwd() + ')');
  }
  const { createApp } = require(factoryPath);
  const app = await createApp();
  appCache = app;
  return app;
}

/**
 * Vercel serverless handler: forwards (req, res) to the Nest/Express app.
 */
function getPathForNest(req) {
  const rawUrl = req.url || '';
  // 1) path from query (rewrite destination: /api?path=/$1)
  const q = rawUrl.indexOf('?');
  const query = q >= 0 ? rawUrl.slice(q + 1) : '';
  const pathParam = query.split('&').find((p) => p.startsWith('path='));
  if (pathParam) {
    const eq = pathParam.indexOf('=');
    const value = eq >= 0 ? pathParam.slice(eq + 1) : '';
    try {
      const decoded = decodeURIComponent(value).replace(/^\/+/, '/') || '/';
      const rest = query.split('&').filter((p) => !p.startsWith('path=')).join('&');
      return rest ? decoded + (decoded.includes('?') ? '&' : '?') + rest : decoded;
    } catch (_) {}
  }
  // 2) path from header (some Vercel setups)
  const forwarded = req.headers['x-vercel-forwarded-url'] || req.headers['x-forwarded-url'];
  if (forwarded) {
    try {
      const u = new URL(forwarded.startsWith('http') ? forwarded : 'https://x.com' + (forwarded.startsWith('/') ? forwarded : '/' + forwarded));
      return u.pathname + (u.search || '') || '/';
    } catch (_) {}
  }
  // 3) fallback: strip /api
  if (rawUrl.startsWith('/api')) return rawUrl.replace(/^\/api/, '') || '/';
  return rawUrl || '/';
}

module.exports = async (req, res) => {
  try {
    req.url = getPathForNest(req);
    const app = await getApp();
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp(req, res);
  } catch (err) {
    sendError(res, err);
  }
};
