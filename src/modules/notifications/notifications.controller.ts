import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '../users/entities/user.entity';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: User,
    @Query('daysAhead') daysAhead?: string,
    @Query('limit') limit?: string,
    @Query('includeStable') includeStable?: string,
  ) {
    const days = daysAhead ? parseInt(daysAhead, 10) : 14;
    const lim = limit ? parseInt(limit, 10) : 50;
    const include =
      includeStable === '1' || includeStable === 'true' || includeStable === 'yes';
    return this.notifications.list(user, Number.isFinite(days) ? days : 14, Number.isFinite(lim) ? lim : 50, include);
  }

  @Get('count')
  async count(
    @CurrentUser() user: User,
    @Query('daysAhead') daysAhead?: string,
  ) {
    const days = daysAhead ? parseInt(daysAhead, 10) : 14;
    const result = await this.notifications.list(
      user,
      Number.isFinite(days) ? days : 14,
      200,
      false,
    );
    return {
      total: result.total,
      unread: result.unread,
      by_severity: result.by_severity,
    };
  }
}
