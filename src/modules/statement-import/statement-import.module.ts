import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StatementImport } from './entities/statement-import.entity';
import { StatementImportRow } from './entities/statement-import-row.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { AccountsModule } from '../accounts/accounts.module';
import { CategoriesModule } from '../categories/categories.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { AuthModule } from '../auth/auth.module';
import { StatementImportController } from './statement-import.controller';
import { StatementImportService } from './statement-import.service';
import { StatementParserService } from './parsers/statement-parser.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([StatementImport, StatementImportRow, Transaction]),
    AuthModule,
    AccountsModule,
    CategoriesModule,
    TransactionsModule,
  ],
  controllers: [StatementImportController],
  providers: [StatementImportService, StatementParserService],
})
export class StatementImportModule {}
