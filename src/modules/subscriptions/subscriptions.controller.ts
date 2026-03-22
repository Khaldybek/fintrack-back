import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('summary')
  summary(@CurrentUser() user: User) {
    return this.subscriptionsService.summary(user.id);
  }

  @Get('reminders')
  reminders(@CurrentUser() user: User, @Query('daysAhead') daysAhead?: string) {
    const days = daysAhead ? parseInt(daysAhead, 10) : 14;
    return this.subscriptionsService.reminders(user.id, Number.isFinite(days) ? days : 14);
  }

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.subscriptionsService.findAllByUser(user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.subscriptionsService.findOne(id, user.id);
  }

  @Post()
  create(@Body() dto: CreateSubscriptionDto, @CurrentUser() user: User) {
    return this.subscriptionsService.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSubscriptionDto,
    @CurrentUser() user: User,
  ) {
    return this.subscriptionsService.update(id, user.id, dto);
  }

  @Post(':id/pay')
  pay(@Param('id') id: string, @CurrentUser() user: User) {
    return this.subscriptionsService.pay(id, user.id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: User) {
    await this.subscriptionsService.remove(id, user.id);
    return { success: true };
  }
}
