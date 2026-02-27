import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Household } from './entities/household.entity';
import { HouseholdMember } from './entities/household-member.entity';
import { HouseholdController } from './household.controller';
import { HouseholdService } from './household.service';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Household, HouseholdMember]),
    AuthModule,
    UsersModule,
  ],
  controllers: [HouseholdController],
  providers: [HouseholdService],
  exports: [HouseholdService],
})
export class HouseholdModule {}
