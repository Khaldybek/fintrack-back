'use strict';

const path = require('path');
const fs = require('fs');

let appCache = null;

function getFactoryPath() {
  return path.join(process.cwd(), 'dist', 'app-factory.js');
}

function sendError(res, err) {
  const msg = err && (err.message || String(err));
  console.error('Vercel handler error:', msg, err && err.stack);
  res.status(500).setHeader('Content-Type', 'application/json').end(
    JSON.stringify({
      statusCode: 500,
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'production' ? 'Internal error' : msg,
    })
  );
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
 * Single entry for Vercel (builds + routes). All requests hit this file; req.url is the original path.
 */
module.exports = async (req, res) => {
  try {
    const app = await getApp();
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp(req, res);
  } catch (err) {
    sendError(res, err);
  }
};
