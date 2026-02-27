import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { TransactionSplit } from './entities/transaction-split.entity';
import { TransactionTemplate } from './entities/transaction-template.entity';
import { Account } from '../accounts/entities/account.entity';
import { AccountsModule } from '../accounts/accounts.module';
import { CategoriesModule } from '../categories/categories.module';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, TransactionSplit, TransactionTemplate, Account]),
    AuthModule,
    AccountsModule,
    CategoriesModule,
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
