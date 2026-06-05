import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Household } from './entities/household.entity';
import { HouseholdMember } from './entities/household-member.entity';
import { HouseholdInvite } from './entities/household-invite.entity';
import { HouseholdBudget } from './entities/household-budget.entity';
import { HouseholdController } from './household.controller';
import { HouseholdPublicController } from './household-public.controller';
import { HouseholdService } from './household.service';
import { HouseholdMailService } from './household-mail.service';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { Account } from '../accounts/entities/account.entity';
import { Transaction } from '../transactions/entities/transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Household,
      HouseholdMember,
      HouseholdInvite,
      HouseholdBudget,
      Account,
      Transaction,
    ]),
    AuthModule,
    UsersModule,
  ],
  controllers: [HouseholdController, HouseholdPublicController],
  providers: [HouseholdService, HouseholdMailService],
  exports: [HouseholdService],
})
export class HouseholdModule {}
