import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  /**
   * Всегда возвращаем 401 (не 403) при ошибке аутентификации, с единым форматом для фронта.
   * 403 на бэкенде только у FEATURE_GATED (лимиты Free).
   */
  handleRequest<TUser>(err: unknown, user: TUser, info: unknown, _context: ExecutionContext): TUser {
    if (err) {
      throw err instanceof Error ? err : new UnauthorizedException(String(err));
    }
    if (!user) {
      const msg = info && typeof info === 'object' && 'message' in info
        ? String((info as { message?: string }).message)
        : 'Token missing or invalid';
      throw new UnauthorizedException({
        message: msg,
        code: 'TOKEN_INVALID_OR_MISSING',
      });
    }
    return user;
  }
}
