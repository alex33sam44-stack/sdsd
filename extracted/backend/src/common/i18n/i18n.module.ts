import { Global, MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module';
import { I18nController } from './i18n.controller';
import { I18nResponseInterceptor } from './i18n.interceptor';
import { I18nService } from './i18n.service';
import { LocaleResolverMiddleware } from './locale-resolver.middleware';

/**
 * Global i18n module.
 *
 * - Registers `LocaleResolverMiddleware` so every incoming request has
 *   `req.locale` populated before any controller runs.
 * - Registers `I18nResponseInterceptor` globally to localize JSON
 *   payloads on their way out.
 * - Exposes `I18nService` for direct use in modules that need to
 *   pre-translate (OG previews, share captions, system emails, …).
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [I18nController],
  providers: [
    I18nService,
    { provide: APP_INTERCEPTOR, useClass: I18nResponseInterceptor },
  ],
  exports: [I18nService],
})
export class I18nModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LocaleResolverMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
