import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { UpdateMeDto } from './dto/update-me.dto';
import { PlanService } from '../billing/plan.service';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(
    private readonly usersService: UsersService,
    private readonly planService: PlanService,
  ) {}

  @Get()
  getMe(@CurrentUser() user: User) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      timezone: user.timezone,
      locale: user.locale,
    };
  }

  @Patch()
  async updateMe(@CurrentUser() user: User, @Body() dto: UpdateMeDto) {
    const updated = await this.usersService.update(user.id, {
      name: dto.name,
      timezone: dto.timezone,
      locale: dto.locale,
      avatarUrl: dto.avatarUrl,
    });
    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      avatarUrl: updated.avatarUrl,
      timezone: updated.timezone,
      locale: updated.locale,
    };
  }

  @Get('plan')
  getPlan(@CurrentUser() user: User) {
    return this.planService.getPlanResponse(user.id);
  }
}
