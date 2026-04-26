/**
 * PM2: из каталога проекта (где лежит этот файл и .env):
 *   npm run build && npm run pm2:start
 * Либо: pm2 start ecosystem.config.cjs
 * Переменные берутся из .env в cwd — см. loadEnv в app-factory (process.cwd()).
 */
module.exports = {
  apps: [
    {
      name: 'fintrack-back',
      script: 'dist/main.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
