import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/observability/all-exceptions.filter';
import { RequestContextMiddleware } from './common/observability/request-context.middleware';
import { RequestLoggingInterceptor } from './common/observability/request-logging.interceptor';
import { PrismaModule } from './common/prisma/prisma.module';
import { TenancyModule } from './common/tenancy/tenancy.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { BillingModule } from './modules/billing/billing.module';
import { DraftsModule } from './modules/drafts/drafts.module';
import { FavoritesModule } from './modules/favorites/favorites.module';
import { HealthModule } from './modules/health/health.module';
import { LayoutsModule } from './modules/layouts/layouts.module';
import { LinesModule } from './modules/lines/lines.module';
import { RolesModule } from './modules/roles/roles.module';
import { SearchModule } from './modules/search/search.module';
import { StationsModule } from './modules/stations/stations.module';
import { StopsModule } from './modules/stops/stops.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';
import { ValidationModule } from './modules/validation/validation.module';
import { ZonesModule } from './modules/zones/zones.module';
import { OgModule } from './modules/og/og.module';
import { I18nModule } from './common/i18n/i18n.module';
import { LocalSearchModule } from './modules/local-search/local-search.module';
import { IntercityModule } from './modules/intercity/intercity.module';
import { DataQualityModule } from './modules/data-quality/data-quality.module';
import { AiModule } from './modules/ai/ai.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { SeoModule } from './modules/seo/seo.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    TenancyModule,
    I18nModule,
    AuthModule,
    UsersModule,
    RolesModule,
    StationsModule,
    LinesModule,
    StopsModule,
    LayoutsModule,
    ZonesModule,
    DraftsModule,
    AuditModule,
    ValidationModule,
    FavoritesModule,
    SearchModule,
    HealthModule,
    TenantsModule,
    BillingModule,
    OgModule,
    LocalSearchModule,
    IntercityModule,
    DataQualityModule,
    AiModule,
    RealtimeModule,
    SeoModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
