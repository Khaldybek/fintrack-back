import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { AuthModule } from '../auth/auth.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { CreditsModule } from '../credits/credits.module';

@Module({
  imports: [AuthModule, DashboardModule, SubscriptionsModule, CreditsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
