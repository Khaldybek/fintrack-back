import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SecurityService } from '../security/security.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
    private readonly securityService: SecurityService,
  ) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    await this.securityService.logEvent(result.user.id, 'register');
    await this.authService.setRefreshCookie(
      res,
      result.refreshToken,
      result.refreshExpiresAt,
    );
    return {
      accessToken: result.accessToken,
      accessExpiresIn: result.accessExpiresIn,
      user: result.user,
    };
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    await this.securityService.logEvent(result.user.id, 'login');
    await this.authService.setRefreshCookie(
      res,
      result.refreshToken,
      result.refreshExpiresAt,
    );
    return {
      accessToken: result.accessToken,
      accessExpiresIn: result.accessExpiresIn,
      user: result.user,
    };
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Passport redirects to Google
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(
    @Req() req: Request & { user: { id: string; emails: Array<{ value: string }>; displayName?: string; photos?: Array<{ value: string }> } },
    @Res() res: Response,
  ) {
    const result = await this.authService.loginGoogle(req.user);
    await this.securityService.logEvent(result.user.id, 'google_login');
    await this.authService.setRefreshCookie(
      res,
      result.refreshToken,
      result.refreshExpiresAt,
    );
    const frontendBase = this.config.getOrThrow<string>('auth.frontendUrl').replace(/\/$/, '');
    const oauthPath = this.config.getOrThrow<string>('auth.frontendOAuthCallbackPath');
    const pathSeg = oauthPath.startsWith('/') ? oauthPath : `/${oauthPath}`;
    const hash = new URLSearchParams({
      access_token: result.tokenPair.accessToken,
      expires_in: result.tokenPair.accessExpiresIn,
      user: JSON.stringify(result.tokenPair.user),
    }).toString();
    res.redirect(`${frontendBase}${pathSeg}#${hash}`);
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieName = this.config.getOrThrow<string>('auth.cookie.refreshName');
    const refreshToken = req.cookies?.[cookieName];
    if (!refreshToken) {
      throw new UnauthorizedException({
        message: 'Refresh token required. Send credentials (cookies) with the request.',
        code: 'REFRESH_TOKEN_MISSING',
      });
    }
    const result = await this.authService.refreshFromCookie(refreshToken);
    await this.authService.setRefreshCookie(
      res,
      result.newRefreshToken,
      result.newExpiresAt,
    );
    return {
      accessToken: result.tokenPair.accessToken,
      accessExpiresIn: result.tokenPair.accessExpiresIn,
      user: result.tokenPair.user,
    };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookieName = this.config.getOrThrow<string>('auth.cookie.refreshName');
    const refreshToken = req.cookies?.[cookieName];
    await this.authService.logout(refreshToken);
    await this.authService.clearRefreshCookie(res);
    return { success: true };
  }

  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email.trim().toLowerCase());
    return { success: true };
  }

  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { success: true, message: 'Пароль успешно изменён. Войдите с новым паролем.' };
  }

  /** Только для разработки: отправить тестовое письмо на указанный email (проверка SMTP). */
  @Post('send-test-email')
  async sendTestEmail(@Body() body: { to?: string }) {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException();
    }
    const to = (body?.to ?? 'etkuyrdaq@gmail.com').trim();
    if (!to || !to.includes('@')) throw new BadRequestException('Укажите корректный email в поле to');
    await this.authService.sendTestEmail(to);
    return { success: true, message: `Тестовое письмо отправлено на ${to}` };
  }
}
