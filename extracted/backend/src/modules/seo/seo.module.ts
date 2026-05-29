import { Module } from '@nestjs/common';
import { I18nModule } from '../../common/i18n/i18n.module';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';

@Module({
  imports: [PrismaModule, I18nModule],
  controllers: [SeoController],
  providers: [SeoService],
  exports: [SeoService],
})
export class SeoModule {}
