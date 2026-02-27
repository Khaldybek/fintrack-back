import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditLoan } from './entities/credit-loan.entity';
import { CreditsController } from './credits.controller';
import { CreditsService } from './credits.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([CreditLoan]), AuthModule],
  controllers: [CreditsController],
  providers: [CreditsService],
})
export class CreditsModule {}
