import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'change-me-in-production',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'change-me-refresh-in-production',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  cookie: {
    refreshName: process.env.REFRESH_COOKIE_NAME ?? 'fintrack_refresh',
    options: (() => {
      const sameSite = (process.env.COOKIE_SAME_SITE as 'lax' | 'strict' | 'none') ?? 'lax';
      // sameSite=none требует Secure=true (cross-site context)
      const secure = sameSite === 'none' || process.env.NODE_ENV === 'production';
      return {
        httpOnly: true,
        secure,
        sameSite,
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      };
    })(),
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL ?? 'http://localhost:3000/v1/auth/google/callback',
  },
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3001',
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? 'noreply@fintrack.local',
  },
}));
