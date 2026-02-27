import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { Response } from 'express';
import { User } from '../users/entities/user.entity';
import { RefreshToken } from '../users/entities/refresh-token.entity';
import { PasswordResetToken } from '../users/entities/password-reset-token.entity';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

export interface TokenPair {
  accessToken: string;
  accessExpiresIn: string;
  user: { id: string; email: string; name: string | null };
}

export interface AuthResult extends TokenPair {
  refreshToken: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(PasswordResetToken)
    private readonly passwordResetTokenRepo: Repository<PasswordResetToken>,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async createRefreshToken(userId: string): Promise<{
    token: string;
    expiresAt: Date;
  }> {
    const refreshSecret = this.config.getOrThrow<string>('auth.jwt.refreshSecret');
    const refreshExpiresIn = this.config.getOrThrow<string>('auth.jwt.refreshExpiresIn');
    const token = randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = this.parseExpiry(refreshExpiresIn);

    await this.refreshTokenRepo.insert({
      userId,
      tokenHash,
      expiresAt,
    });
    return { token, expiresAt };
  }

  private parseExpiry(expiresIn: string): Date {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const ms =
      unit === 's' ? value * 1000
      : unit === 'm' ? value * 60 * 1000
      : unit === 'h' ? value * 60 * 60 * 1000
      : value * 24 * 60 * 60 * 1000;
    return new Date(Date.now() + ms);
  }

  async register(dto: RegisterDto): Promise<AuthResult> {
    const user = await this.usersService.createByEmail({
      email: dto.email,
      password: dto.password,
      name: dto.name,
    });
    const tokenPair = await this.issueTokenPair(user);
    const { token, expiresAt } = await this.createRefreshToken(user.id);
    return { ...tokenPair, refreshToken: token, refreshExpiresAt: expiresAt };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid email or password');
    const valid = await this.usersService.validatePassword(user, dto.password);
    if (!valid) throw new UnauthorizedException('Invalid email or password');
    const tokenPair = await this.issueTokenPair(user);
    const { token, expiresAt } = await this.createRefreshToken(user.id);
    return { ...tokenPair, refreshToken: token, refreshExpiresAt: expiresAt };
  }

  async loginGoogle(profile: {
    id: string;
    emails: Array<{ value: string }>;
    displayName?: string;
    photos?: Array<{ value: string }>;
  }): Promise<{ user: User; tokenPair: TokenPair; refreshToken: string; refreshExpiresAt: Date }> {
    const email = profile.emails?.[0]?.value;
    if (!email) throw new BadRequestException('Google profile has no email');
    const user = await this.usersService.createOrFindByGoogle({
      googleId: profile.id,
      email,
      name: profile.displayName ?? null,
      avatarUrl: profile.photos?.[0]?.value ?? null,
    });
    const tokenPair = await this.issueTokenPair(user);
    const { token, expiresAt } = await this.createRefreshToken(user.id);
    return { user, tokenPair, refreshToken: token, refreshExpiresAt: expiresAt };
  }

  async issueTokenPair(user: User): Promise<TokenPair> {
    const accessSecret = this.config.getOrThrow<string>('auth.jwt.accessSecret');
    const accessExpiresIn = this.config.getOrThrow<string>('auth.jwt.accessExpiresIn');
    const n = parseInt(accessExpiresIn, 10);
    const expiresInSec = accessExpiresIn.endsWith('d') ? n * 86400 : accessExpiresIn.endsWith('h') ? n * 3600 : accessExpiresIn.endsWith('m') ? n * 60 : n;
    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email },
      { secret: accessSecret, expiresIn: expiresInSec },
    );
    return {
      accessToken,
      accessExpiresIn,
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  async setRefreshCookie(res: Response, token: string, expiresAt: Date): Promise<void> {
    const cookieName = this.config.getOrThrow<string>('auth.cookie.refreshName');
    const options = this.config.getOrThrow('auth.cookie.options') as {
      httpOnly: boolean;
      secure: boolean;
      sameSite: 'lax' | 'strict' | 'none';
      path: string;
      maxAge: number;
    };
    res.cookie(cookieName, token, {
      ...options,
      expires: expiresAt,
    });
  }

  async clearRefreshCookie(res: Response): Promise<void> {
    const cookieName = this.config.getOrThrow<string>('auth.cookie.refreshName');
    res.clearCookie(cookieName, {
      path: '/',
      httpOnly: true,
      secure: this.config.get('auth.cookie.options.secure') ?? false,
      sameSite: 'lax',
    });
  }

  async refreshFromCookie(refreshToken: string): Promise<{ tokenPair: TokenPair; newRefreshToken: string; newExpiresAt: Date }> {
    if (!refreshToken) throw new UnauthorizedException('Refresh token required');
    const tokenHash = this.hashToken(refreshToken);
    const rt = await this.refreshTokenRepo.findOne({
      where: { tokenHash },
      relations: ['user'],
    });
    if (!rt) throw new UnauthorizedException('Invalid refresh token');
    if (rt.expiresAt < new Date()) {
      await this.refreshTokenRepo.delete(rt.id);
      throw new UnauthorizedException('Refresh token expired');
    }
    await this.refreshTokenRepo.delete(rt.id);
    const { token: newToken, expiresAt: newExpiresAt } = await this.createRefreshToken(rt.user.id);
    const tokenPair = await this.issueTokenPair(rt.user);
    return { tokenPair, newRefreshToken: newToken, newExpiresAt };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      await this.refreshTokenRepo.delete({ tokenHash });
    }
  }

  /** Forgot password: create reset token and optionally send email. Always returns success (no user enumeration). */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.passwordHash) return;
    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await this.passwordResetTokenRepo.insert({
      userId: user.id,
      tokenHash,
      expiresAt,
    });
    const frontendUrl = this.config.get<string>('auth.frontendUrl');
    if (frontendUrl && process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log(`[dev] Password reset link for ${email}: ${frontendUrl}/reset-password?token=${token}`);
    }
    // TODO: in production send email with link (e.g. ${frontendUrl}/reset-password?token=...)
  }

  /** Reset password using token from email link. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    const record = await this.passwordResetTokenRepo.findOne({
      where: { tokenHash },
      relations: ['user'],
    });
    if (!record) throw new UnauthorizedException('Invalid or expired reset link');
    if (record.expiresAt < new Date()) {
      await this.passwordResetTokenRepo.delete(record.id);
      throw new UnauthorizedException('Reset link has expired');
    }
    await this.usersService.setPassword(record.user.id, newPassword);
    await this.passwordResetTokenRepo.delete(record.id);
  }
}
