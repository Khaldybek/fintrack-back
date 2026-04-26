import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from '../users/entities/refresh-token.entity';
import { PasswordResetToken } from '../users/entities/password-reset-token.entity';
import { UsersModule } from '../users/users.module';
import { SecurityModule } from '../security/security.module';
import { AuthController } from './auth.controller';
import { MeController } from './me.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';

/** @Module() runs at import time — load .env into process.env before checking Google vars. */
function loadDotEnvIfNeeded(): void {
  const path = join(process.cwd(), '.env');
  if (!existsSync(path)) return;
  const content = readFileSync(path, 'utf8');
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  }
}
loadDotEnvIfNeeded();

/** Passport GoogleStrategy crashes if clientID is empty — skip when OAuth not configured. */
function isGoogleOAuthConfigured(): boolean {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return Boolean(id && secret);
}

@Module({
  imports: [
    UsersModule,
    forwardRef(() => SecurityModule),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const raw = config.getOrThrow<string>('auth.jwt.accessExpiresIn');
        const num = parseInt(raw, 10);
        const seconds = raw.endsWith('d') ? num * 86400 : raw.endsWith('h') ? num * 3600 : raw.endsWith('m') ? num * 60 : num;
        return {
          secret: config.getOrThrow<string>('auth.jwt.accessSecret'),
          signOptions: { expiresIn: seconds },
        };
      },
    }),
    TypeOrmModule.forFeature([RefreshToken, PasswordResetToken]),
  ],
  controllers: [AuthController, MeController],
  providers: [AuthService, JwtStrategy, ...(isGoogleOAuthConfigured() ? [GoogleStrategy] : [])],
  exports: [AuthService],
})
export class AuthModule {}
