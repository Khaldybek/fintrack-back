import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { BudgetsService } from './budgets.service';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';

@Controller('budgets')
@UseGuards(JwtAuthGuard)
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.budgetsService.findAllByUser(user.id, user.timezone);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.budgetsService.findOne(id, user.id, user.timezone);
  }

  @Post()
  create(@Body() dto: CreateBudgetDto, @CurrentUser() user: User) {
    return this.budgetsService.create(user.id, dto, user.timezone);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBudgetDto,
    @CurrentUser() user: User,
  ) {
    return this.budgetsService.update(id, user.id, dto, user.timezone);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: User) {
    await this.budgetsService.remove(id, user.id);
    return { success: true };
  }
}
