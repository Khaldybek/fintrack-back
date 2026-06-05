import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { HouseholdService } from './household.service';

@Controller('household/invites')
export class HouseholdPublicController {
  constructor(private readonly householdService: HouseholdService) {}

  @Get('preview')
  preview(@Query('token') token: string) {
    if (!token?.trim()) throw new BadRequestException('token is required');
    return this.householdService.previewInvite(token);
  }
}
