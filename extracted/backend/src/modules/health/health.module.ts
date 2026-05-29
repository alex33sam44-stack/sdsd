import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { HealthController } from './health.controller';
import { HealthDeepController } from './health.deep.controller';

@Module({
  imports: [PrismaModule],
  controllers: [HealthController, HealthDeepController],
})
export class HealthModule {}
