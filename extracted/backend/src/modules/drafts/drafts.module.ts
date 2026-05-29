import { Module } from '@nestjs/common';
import { DraftsController } from './drafts.controller';
import { DraftsService } from './drafts.service';
import { BillingModule } from '../billing/billing.module';

@Module({ imports: [BillingModule], controllers: [DraftsController], providers: [DraftsService] })
export class DraftsModule {}
