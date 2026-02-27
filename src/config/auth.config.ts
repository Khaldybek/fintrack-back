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
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: (process.env.COOKIE_SAME_SITE as 'lax' | 'strict' | 'none') ?? 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    },
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL ?? 'http://localhost:3000/v1/auth/google/callback',
  },
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3001',
}));
