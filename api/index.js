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
module.exports = async (req, res) => {
  try {
    // Rewrite sends path in ?path=/$1 so Vercel always hits /api (this file). Restore path for Nest.
    const rawUrl = req.url || '';
    const q = rawUrl.indexOf('?');
    const query = q >= 0 ? rawUrl.slice(q + 1) : '';
    const pathParam = query.split('&').find((p) => p.startsWith('path='));
    if (pathParam) {
      const decoded = decodeURIComponent(pathParam.slice(5)).replace(/^\/+/, '/') || '/';
      const rest = query.split('&').filter((p) => !p.startsWith('path=')).join('&');
      req.url = rest ? decoded + (decoded.includes('?') ? '&' : '?') + rest : decoded;
    } else if (rawUrl.startsWith('/api')) {
      req.url = rawUrl.replace(/^\/api/, '') || '/';
    }
    const app = await getApp();
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp(req, res);
  } catch (err) {
    sendError(res, err);
  }
};
