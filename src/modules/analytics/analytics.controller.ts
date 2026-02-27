import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('monthly')
  monthly(@CurrentUser() user: User, @Query('year') year?: string) {
    const y = year ? parseInt(year, 10) : undefined;
    const validYear =
      y !== undefined && Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : undefined;
    return this.analytics.monthly(user, validYear);
  }

  @Get('categories')
  categories(@CurrentUser() user: User, @Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) {
    return this.analytics.categories(user, dateFrom, dateTo);
  }

  @Get('trends')
  trends(@CurrentUser() user: User, @Query('months') months?: string) {
    const m = months ? parseInt(months, 10) : 6;
    return this.analytics.trends(user, Number.isInteger(m) && m >= 1 && m <= 60 ? m : 6);
  }

  @Get('heatmap')
  heatmap(@CurrentUser() user: User) {
    return this.analytics.heatmap(user);
  }

  @Get('anomalies')
  anomalies(@CurrentUser() user: User) {
    return this.analytics.anomalies(user);
  }

  @Post('monthly-report/export')
  monthlyReportExport(
    @CurrentUser() user: User,
    @Body() body: { year: number; month: number },
  ) {
    return this.analytics.monthlyReportExport(user, body?.year, body?.month);
  }
}
