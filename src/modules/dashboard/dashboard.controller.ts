import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { DashboardService } from './dashboard.service';
import { CreateSalaryScheduleDto } from './dto/create-salary-schedule.dto';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary(@CurrentUser() user: User) {
    return this.dashboardService.getSummary(user);
  }

  @Get('forecast')
  getForecast(@CurrentUser() user: User, @Query('includeAi') includeAi?: string) {
    const flag = includeAi === '1' || includeAi === 'true' || includeAi === 'yes';
    return this.dashboardService.getForecast(user, flag);
  }

  @Get('alerts')
  getAlerts(@CurrentUser() user: User) {
    return this.dashboardService.getAlerts(user);
  }

  @Get('insight')
  getInsight(@CurrentUser() user: User) {
    return this.dashboardService.getInsight(user);
  }

  @Get('index')
  getIndex(@CurrentUser() user: User) {
    return this.dashboardService.getIndex(user);
  }

  @Get('charts')
  getCharts(
    @CurrentUser() user: User,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('months') months?: string,
  ) {
    const m = months ? parseInt(months, 10) : 6;
    const safeMonths = Number.isInteger(m) && m >= 1 && m <= 24 ? m : 6;
    if ((dateFrom && !dateTo) || (!dateFrom && dateTo)) {
      throw new BadRequestException('dateFrom and dateTo must be provided together');
    }
    return this.dashboardService.getCharts(user, dateFrom, dateTo, safeMonths);
  }

  @Get('salary-schedules')
  getSalarySchedules(@CurrentUser() user: User) {
    return this.dashboardService.getSalarySchedules(user.id);
  }

  @Post('salary-schedules')
  createSalarySchedule(@Body() dto: CreateSalaryScheduleDto, @CurrentUser() user: User) {
    return this.dashboardService.createSalarySchedule(
      user.id,
      dto.dayOfMonth,
      dto.label,
      dto.amountMinor,
    );
  }

  @Delete('salary-schedules/:id')
  async removeSalarySchedule(@Param('id') id: string, @CurrentUser() user: User) {
    await this.dashboardService.removeSalarySchedule(id, user.id);
    return { success: true };
  }
}
