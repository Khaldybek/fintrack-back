import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiService } from './ai.service';
import { AiCacheService } from './ai-cache.service';
import { AiContentCache } from './entities/ai-content-cache.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AiContentCache])],
  providers: [AiService, AiCacheService],
  exports: [AiService, AiCacheService],
})
export class AiModule {}
