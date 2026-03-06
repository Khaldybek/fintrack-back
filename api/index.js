'use strict';

const path = require('path');

let appCache = null;

function getFactoryPath() {
  const fromCwd = path.join(process.cwd(), 'dist', 'app-factory.js');
  return fromCwd;
}

async function getApp() {
  if (appCache) return appCache;
  const factoryPath = getFactoryPath();
  const { createApp } = require(factoryPath);
  const app = await createApp();
  appCache = app;
  return app;
}

/**
 * Vercel serverless handler: forwards (req, res) to the Nest/Express app.
 * All routes are rewritten to this handler (see vercel.json).
 */
module.exports = async (req, res) => {
  try {
    const app = await getApp();
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp(req, res);
  } catch (err) {
    console.error('Vercel handler error:', err);
    res.status(500).setHeader('Content-Type', 'application/json').end(
      JSON.stringify({
        statusCode: 500,
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'production' ? 'Function invocation failed' : (err && (err.message || String(err))),
      })
    );
  }
};
