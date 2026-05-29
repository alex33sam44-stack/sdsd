import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingConfigService } from './billing-config.service';
import { StripeProviderService } from './providers/stripe-provider.service';
import { LemonProviderService } from './providers/lemon-provider.service';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [BillingController],
  providers: [BillingConfigService, StripeProviderService, LemonProviderService, BillingService],
  exports: [BillingConfigService, StripeProviderService, LemonProviderService, BillingService],
})
export class BillingModule {}
