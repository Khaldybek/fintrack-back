import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { HouseholdService } from './household.service';
import { CreateHouseholdDto } from './dto/create-household.dto';
import { InviteHouseholdDto } from './dto/invite-household.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

@Controller('household')
@UseGuards(JwtAuthGuard)
export class HouseholdController {
  constructor(private readonly householdService: HouseholdService) {}

  @Get()
  getHousehold(@CurrentUser() user: User) {
    return this.householdService.getHousehold(user.id);
  }

  @Post()
  create(@Body() dto: CreateHouseholdDto, @CurrentUser() user: User) {
    return this.householdService.create(user.id, dto);
  }

  @Post('invite')
  invite(@Body() dto: InviteHouseholdDto, @CurrentUser() user: User) {
    return this.householdService.invite(user.id, dto);
  }

  @Patch('members/:id')
  updateMemberRole(
    @Param('id') id: string,
    @Body() dto: UpdateMemberRoleDto,
    @CurrentUser() user: User,
  ) {
    return this.householdService.updateMemberRole(user.id, id, dto);
  }
}
