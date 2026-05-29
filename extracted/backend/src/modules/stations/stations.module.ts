import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { StationsController } from './stations.controller';
import { StationsService } from './stations.service';

@Module({ imports: [BillingModule], controllers: [StationsController], providers: [StationsService] })
export class StationsModule {}
