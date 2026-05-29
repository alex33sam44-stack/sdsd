import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { RealtimeBus } from './realtime.bus';
import { RealtimeController } from './realtime.controller';
import { RealtimeService } from './realtime.service';

/**
 * Realtime module. Marked @Global so any module (lines, drafts,
 * tenants, …) can inject `RealtimeService` to publish updates
 * without an additional import.
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [RealtimeController],
  providers: [RealtimeBus, RealtimeService],
  exports: [RealtimeBus, RealtimeService],
})
export class RealtimeModule {}
