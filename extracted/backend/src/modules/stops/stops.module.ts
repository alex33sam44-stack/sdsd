import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { StopsController } from './stops.controller';
import { StopsService } from './stops.service';

@Module({ imports: [BillingModule], controllers: [StopsController], providers: [StopsService] })
export class StopsModule {}
