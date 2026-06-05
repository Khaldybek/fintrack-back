import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingCheckoutSession } from './entities/billing-checkout-session.entity';
import { UserBillingSubscription } from './entities/user-billing-subscription.entity';
import { BillingInvoice } from './entities/billing-invoice.entity';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PlanService } from './plan.service';
import { HouseholdMember } from '../household/entities/household-member.entity';
import { Household } from '../household/entities/household.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      BillingCheckoutSession,
      UserBillingSubscription,
      BillingInvoice,
      HouseholdMember,
      Household,
    ]),
  ],
  controllers: [BillingController],
  providers: [BillingService, PlanService],
  exports: [PlanService, BillingService],
})
export class BillingModule {}
