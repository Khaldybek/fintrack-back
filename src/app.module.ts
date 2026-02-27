import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import databaseConfig from './config/database.config';
import authConfig from './config/auth.config';
import { AuthModule } from './modules/auth/auth.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { BudgetsModule } from './modules/budgets/budgets.module';
import { GoalsModule } from './modules/goals/goals.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { CreditsModule } from './modules/credits/credits.module';
import { SecurityModule } from './modules/security/security.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { HouseholdModule } from './modules/household/household.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, authConfig],
      envFilePath: ['.env'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        configService.getOrThrow('database'),
    }),
    AuthModule,
    AccountsModule,
    CategoriesModule,
    TransactionsModule,
    DashboardModule,
    BudgetsModule,
    GoalsModule,
    AnalyticsModule,
    CreditsModule,
    SecurityModule,
    SubscriptionsModule,
    HouseholdModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
