import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';
import { runGoalsBigintMigration } from './database/run-goals-bigint-migration';

function loadEnv(): void {
  const path = join(process.cwd(), '.env');
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf8');
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

async function bootstrap() {
  loadEnv();
  try {
    await runGoalsBigintMigration();
  } catch {
    // migration optional (e.g. first run without goals table)
  }
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('v1');
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  const frontendUrl = process.env.FRONTEND_URL ?? '';
  const allowedOrigins = frontendUrl
    ? frontendUrl.split(',').map((o) => o.trim()).filter(Boolean)
    : [];
  if (process.env.NODE_ENV !== 'production') {
    const devOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:5173',
    ];
    devOrigins.forEach((o) => {
      if (o && !allowedOrigins.includes(o)) allowedOrigins.push(o);
    });
  }
  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
