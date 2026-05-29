import { Module } from '@nestjs/common';
import { ValidationController } from './validation.controller';
import { ValidationService } from './validation.service';
import { BillingModule } from '../billing/billing.module';

@Module({ imports: [BillingModule], controllers: [ValidationController], providers: [ValidationService] })
export class ValidationModule {}
