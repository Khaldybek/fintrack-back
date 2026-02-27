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
  providers: [AuthService, JwtStrategy, GoogleStrategy],
  exports: [AuthService],
})
export class AuthModule {}
