import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { BillingService } from './billing.service';
import { PlanService } from './plan.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { ConfirmCheckoutDto } from './dto/confirm-checkout.dto';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly planService: PlanService,
  ) {}

  @Get('plans')
  listPlans() {
    return { plans: this.planService.listPublicPlans() };
  }

  @Get('subscription')
  @UseGuards(JwtAuthGuard)
  getSubscription(@CurrentUser() user: User) {
    return this.billingService.getSubscription(user.id);
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  createCheckout(@CurrentUser() user: User, @Body() dto: CreateCheckoutDto) {
    return this.billingService.createCheckout(user.id, dto.planCode);
  }

  @Post('checkout/:sessionId/confirm')
  @UseGuards(JwtAuthGuard)
  confirmCheckout(
    @CurrentUser() user: User,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: ConfirmCheckoutDto,
  ) {
    return this.billingService.confirmCheckout(user.id, sessionId, dto);
  }

  @Post('cancel')
  @UseGuards(JwtAuthGuard)
  cancel(@CurrentUser() user: User) {
    return this.billingService.cancel(user.id);
  }

  @Get('invoices')
  @UseGuards(JwtAuthGuard)
  listInvoices(@CurrentUser() user: User, @Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : 20;
    return { invoices: this.billingService.listInvoices(user.id, n) };
  }

  @Post('renew')
  @UseGuards(JwtAuthGuard)
  mockRenew(@CurrentUser() user: User) {
    return this.billingService.mockRenew(user.id);
  }
}
