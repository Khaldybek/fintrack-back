import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { GoalsService } from './goals.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { AddGoalEntryDto } from './dto/add-goal-entry.dto';
import { QueryGoalEntriesDto } from './dto/query-goal-entries.dto';

@Controller('goals')
@UseGuards(JwtAuthGuard)
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.goalsService.findAllByUser(user.id);
  }

  @Get(':id/entries')
  getEntries(
    @Param('id') id: string,
    @Query() query: QueryGoalEntriesDto,
    @CurrentUser() user: User,
  ) {
    return this.goalsService.getEntries(id, user.id, query);
  }

  @Get(':id/analytics')
  getAnalytics(@Param('id') id: string, @CurrentUser() user: User) {
    return this.goalsService.getAnalytics(id, user.id);
  }

  @Post(':id/entries')
  addEntry(
    @Param('id') id: string,
    @Body() dto: AddGoalEntryDto,
    @CurrentUser() user: User,
  ) {
    return this.goalsService.addEntry(id, user.id, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.goalsService.findOne(id, user.id);
  }

  @Post()
  create(@Body() dto: CreateGoalDto, @CurrentUser() user: User) {
    return this.goalsService.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateGoalDto,
    @CurrentUser() user: User,
  ) {
    return this.goalsService.update(id, user.id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: User) {
    await this.goalsService.remove(id, user.id);
    return { success: true };
  }
}
