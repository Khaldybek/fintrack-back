'use strict';

const path = require('path');
const fs = require('fs');

let appCache = null;

async function getApp() {
  if (appCache) return appCache;
  const factoryPath = path.join(process.cwd(), 'dist', 'app-factory.js');
  if (!fs.existsSync(factoryPath)) {
    throw new Error('app-factory not found at: ' + factoryPath + ' (cwd: ' + process.cwd() + ')');
  }
  const { createApp } = require(factoryPath);
  appCache = await createApp();
  return appCache;
}

function sendError(res, err) {
  const msg = err && (err.message || String(err));
  console.error('Vercel handler error:', msg, err && err.stack);
  res.status(500).setHeader('Content-Type', 'application/json').end(
    JSON.stringify({ statusCode: 500, error: 'Internal Server Error', message: msg }),
  );
}

function getPathForNest(req) {
  const rawUrl = req.url || '';
  if (rawUrl.startsWith('/v1') || rawUrl === '/') return rawUrl;
  const q = rawUrl.indexOf('?');
  const query = q >= 0 ? rawUrl.slice(q + 1) : '';
  const pathParam = query.split('&').find((p) => p.startsWith('path='));
  if (pathParam) {
    const eq = pathParam.indexOf('=');
    const value = eq >= 0 ? pathParam.slice(eq + 1) : '';
    try {
      let decoded = decodeURIComponent(value) || '/';
      if (decoded !== '/' && !decoded.startsWith('/')) decoded = '/' + decoded;
      const rest = query.split('&').filter((p) => !p.startsWith('path=')).join('&');
      return rest ? decoded + (decoded.includes('?') ? '&' : '?') + rest : decoded;
    } catch (_) {}
  }
  if (rawUrl.startsWith('/api')) return rawUrl.replace(/^\/api/, '') || '/';
  return rawUrl || '/';
}

module.exports = async (req, res) => {
  try {
    req.url = getPathForNest(req);
    if (req.query && typeof req.query === 'object') delete req.query.path;
    const app = await getApp();
    app.getHttpAdapter().getInstance()(req, res);
  } catch (err) {
    sendError(res, err);
  }
};
