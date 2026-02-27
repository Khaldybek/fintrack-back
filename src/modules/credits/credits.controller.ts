import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { CreditsService } from './credits.service';
import { CreateCreditDto } from './dto/create-credit.dto';
import { SimulatePrepaymentDto } from './dto/simulate-prepayment.dto';

@Controller('credits')
@UseGuards(JwtAuthGuard)
export class CreditsController {
  constructor(private readonly credits: CreditsService) {}

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.credits.findAll(user.id);
  }

  @Get('summary')
  summary(@CurrentUser() user: User, @Query('monthlyIncomeMinor') monthlyIncomeMinor?: string) {
    const income = monthlyIncomeMinor ? parseInt(monthlyIncomeMinor, 10) : undefined;
    return this.credits.summary(user.id, income);
  }

  @Get('reminders')
  reminders(@CurrentUser() user: User, @Query('daysAhead') daysAhead?: string) {
    const days = daysAhead ? parseInt(daysAhead, 10) : 14;
    return this.credits.reminders(user.id, Number.isFinite(days) ? days : 14);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.credits.findOne(id, user.id);
  }

  @Post()
  create(@Body() dto: CreateCreditDto, @CurrentUser() user: User) {
    return this.credits.create(user.id, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateCreditDto>, @CurrentUser() user: User) {
    return this.credits.update(id, user.id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: User) {
    await this.credits.remove(id, user.id);
    return { success: true };
  }

  @Post('simulate-prepayment')
  simulatePrepayment(@Body() dto: SimulatePrepaymentDto, @CurrentUser() user: User) {
    return this.credits.simulatePrepayment(user.id, dto.extraPerMonthMinor);
  }
}
