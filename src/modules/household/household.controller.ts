import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { HouseholdService } from './household.service';
import { CreateHouseholdDto } from './dto/create-household.dto';
import { InviteHouseholdDto } from './dto/invite-household.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { CreateHouseholdBudgetDto } from './dto/create-household-budget.dto';
import { UpdateHouseholdBudgetDto } from './dto/update-household-budget.dto';
import { QueryHouseholdTransactionsDto } from './dto/query-household-transactions.dto';

@Controller('household')
@UseGuards(JwtAuthGuard)
export class HouseholdController {
  constructor(private readonly householdService: HouseholdService) {}

  @Get()
  getHousehold(@CurrentUser() user: User) {
    return this.householdService.getHousehold(user.id);
  }

  @Get('overview')
  getOverview(
    @CurrentUser() user: User,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.householdService.getOverview(user.id, dateFrom, dateTo);
  }

  @Get('accounts')
  getSharedAccounts(@CurrentUser() user: User) {
    return this.householdService.getSharedAccounts(user.id);
  }

  @Get('transactions')
  getSharedTransactions(
    @CurrentUser() user: User,
    @Query() query: QueryHouseholdTransactionsDto,
  ) {
    return this.householdService.getSharedTransactions(user.id, query);
  }

  @Get('budgets')
  getBudgets(@CurrentUser() user: User) {
    return this.householdService.getBudgets(user.id, user.timezone);
  }

  @Post('budgets')
  createBudget(@Body() dto: CreateHouseholdBudgetDto, @CurrentUser() user: User) {
    return this.householdService.createBudget(user.id, dto, user.timezone);
  }

  @Patch('budgets/:id')
  updateBudget(
    @Param('id') id: string,
    @Body() dto: UpdateHouseholdBudgetDto,
    @CurrentUser() user: User,
  ) {
    return this.householdService.updateBudget(user.id, id, dto, user.timezone);
  }

  @Delete('budgets/:id')
  async removeBudget(@Param('id') id: string, @CurrentUser() user: User) {
    await this.householdService.removeBudget(user.id, id);
    return { success: true };
  }

  @Post()
  create(@Body() dto: CreateHouseholdDto, @CurrentUser() user: User) {
    return this.householdService.create(user.id, dto);
  }

  @Post('invite')
  invite(@Body() dto: InviteHouseholdDto, @CurrentUser() user: User) {
    return this.householdService.invite(user.id, dto);
  }

  @Get('invites')
  listInvites(@CurrentUser() user: User) {
    return this.householdService.listInvites(user.id);
  }

  @Delete('invites/:id')
  async cancelInvite(@Param('id') id: string, @CurrentUser() user: User) {
    await this.householdService.cancelInvite(user.id, id);
    return { success: true };
  }

  @Post('invites/accept')
  acceptInvite(@Body() dto: AcceptInviteDto, @CurrentUser() user: User) {
    return this.householdService.acceptInvite(user.id, user.email, dto.token);
  }

  @Patch('members/:id')
  updateMemberRole(
    @Param('id') id: string,
    @Body() dto: UpdateMemberRoleDto,
    @CurrentUser() user: User,
  ) {
    return this.householdService.updateMemberRole(user.id, id, dto);
  }

  @Delete('members/:id')
  async removeMember(@Param('id') id: string, @CurrentUser() user: User) {
    await this.householdService.removeMember(user.id, id);
    return { success: true };
  }

  @Post('leave')
  async leave(@CurrentUser() user: User) {
    await this.householdService.leave(user.id);
    return { success: true };
  }
}
