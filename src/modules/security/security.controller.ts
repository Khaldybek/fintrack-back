import { Controller, Delete, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { SecurityService } from './security.service';

@Controller('security')
@UseGuards(JwtAuthGuard)
export class SecurityController {
  constructor(private readonly security: SecurityService) {}

  @Get('sessions')
  getSessions(@CurrentUser() user: User) {
    return this.security.getSessions(user.id);
  }

  @Delete('sessions/:id')
  revokeSession(@Param('id') id: string, @CurrentUser() user: User) {
    return this.security.revokeSession(id, user.id);
  }

  @Get('events')
  getEvents(@CurrentUser() user: User, @Query('limit') limit?: string) {
    return this.security.getEvents(user.id, limit ? parseInt(limit, 10) : 50);
  }
}
