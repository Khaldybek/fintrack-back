'use strict';

const path = require('path');

let appCache = null;

async function getApp() {
  if (appCache) return appCache;
  const factoryPath = path.join(__dirname, '..', 'dist', 'app-factory.js');
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
  const app = await getApp();
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp(req, res);
};
