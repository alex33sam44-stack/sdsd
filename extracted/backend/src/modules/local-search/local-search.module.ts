import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { LocalSearchController } from './local-search.controller';
import { LocalSearchService } from './local-search.service';

/**
 * Egypt local search module.
 *
 * Bridges the curated landmark catalogue with tenant-scoped DB
 * lookups (Station / Line / RouteStop). Wired into AppModule so it
 * receives the global LocaleResolver + I18nResponseInterceptor —
 * names are translated automatically when the user's locale is
 * en/fr/pt.
 */
@Module({
  imports: [PrismaModule],
  controllers: [LocalSearchController],
  providers: [LocalSearchService],
  exports: [LocalSearchService],
})
export class LocalSearchModule {}
