import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
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
  categories(
    @CurrentUser() user: User,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.analytics.categories(user, dateFrom, dateTo);
  }

  @Get('trends')
  trends(@CurrentUser() user: User, @Query('months') months?: string) {
    const m = months ? parseInt(months, 10) : 6;
    return this.analytics.trends(user, Number.isInteger(m) && m >= 1 && m <= 60 ? m : 6);
  }

  @Get('heatmap')
  heatmap(@CurrentUser() user: User, @Query('days') days?: string) {
    const d = days ? parseInt(days, 10) : 90;
    return this.analytics.heatmap(user, Number.isInteger(d) && d >= 7 && d <= 365 ? d : 90);
  }

  @Get('anomalies')
  anomalies(@CurrentUser() user: User) {
    return this.analytics.anomalies(user);
  }

  @Get('top-categories')
  topCategories(
    @CurrentUser() user: User,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('limit') limit?: string,
  ) {
    const l = limit ? parseInt(limit, 10) : 5;
    return this.analytics.topCategories(user, dateFrom, dateTo, Number.isInteger(l) && l >= 1 && l <= 20 ? l : 5);
  }

  @Get('savings-rate')
  savingsRate(@CurrentUser() user: User, @Query('months') months?: string) {
    const m = months ? parseInt(months, 10) : 6;
    return this.analytics.savingsRate(user, Number.isInteger(m) && m >= 1 && m <= 24 ? m : 6);
  }

  @Get('compare')
  compare(
    @CurrentUser() user: User,
    @Query('aFrom') aFrom?: string,
    @Query('aTo') aTo?: string,
    @Query('bFrom') bFrom?: string,
    @Query('bTo') bTo?: string,
  ) {
    if (!aFrom || !aTo || !bFrom || !bTo) {
      throw new BadRequestException('Required query params: aFrom, aTo, bFrom, bTo (YYYY-MM-DD)');
    }
    return this.analytics.compare(
      user,
      { dateFrom: aFrom, dateTo: aTo },
      { dateFrom: bFrom, dateTo: bTo },
    );
  }

  @Post('monthly-report/export')
  monthlyReportExport(
    @CurrentUser() user: User,
    @Body() body: { year: number; month: number },
  ) {
    return this.analytics.monthlyReportExport(user, body?.year, body?.month);
  }
}
