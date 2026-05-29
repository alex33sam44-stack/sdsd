import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

/**
 * AI gateway module. Stateless apart from an in-process LRU cache,
 * so it has no Prisma or other infra dependencies.
 */
@Module({
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
