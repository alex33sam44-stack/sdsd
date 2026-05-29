import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { IntercityController } from './intercity.controller';
import { IntercityService } from './intercity.service';

@Module({
  imports: [PrismaModule],
  controllers: [IntercityController],
  providers: [IntercityService],
  exports: [IntercityService],
})
export class IntercityModule {}
