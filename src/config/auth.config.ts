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
      const crossSite =
        process.env.COOKIE_CROSS_SITE === '1' ||
        process.env.COOKIE_CROSS_SITE === 'true';
      let sameSite = (process.env.COOKIE_SAME_SITE as 'lax' | 'strict' | 'none') ?? 'lax';
      if (crossSite) sameSite = 'none';
      // sameSite=none требует Secure=true (браузер)
      const secure = sameSite === 'none' || process.env.NODE_ENV === 'production';
      const domain = process.env.COOKIE_DOMAIN?.trim() || undefined;
      return {
        httpOnly: true,
        secure,
        sameSite,
        domain,
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      };
    })(),
  },
  google: {
    clientId: (process.env.GOOGLE_CLIENT_ID ?? '').trim(),
    clientSecret: (process.env.GOOGLE_CLIENT_SECRET ?? '').trim(),
    callbackUrl: (
      process.env.GOOGLE_CALLBACK_URL?.trim() ||
      'http://localhost:3000/v1/auth/google/callback'
    ),
  },
  frontendUrl: (process.env.FRONTEND_URL ?? 'http://localhost:3001').trim(),
  /** Путь на фронте для редиректа после Google (без домена). */
  frontendOAuthCallbackPath: (
    process.env.FRONTEND_OAUTH_CALLBACK_PATH?.trim() || '/auth/callback'
  ),
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? 'noreply@fintrack.local',
  },
}));
