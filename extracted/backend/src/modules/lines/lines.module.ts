import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { LinesController } from './lines.controller';
import { LinesService } from './lines.service';

@Module({ imports: [BillingModule], controllers: [LinesController], providers: [LinesService] })
export class LinesModule {}
