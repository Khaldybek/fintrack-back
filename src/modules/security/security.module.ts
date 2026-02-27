import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from '../users/entities/refresh-token.entity';
import { SecurityEvent } from './entities/security-event.entity';
import { SecurityController } from './security.controller';
import { SecurityService } from './security.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RefreshToken, SecurityEvent]),
    forwardRef(() => AuthModule),
  ],
  controllers: [SecurityController],
  providers: [SecurityService],
  exports: [SecurityService],
})
export class SecurityModule {}
