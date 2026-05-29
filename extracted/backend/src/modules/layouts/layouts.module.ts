import { Module } from '@nestjs/common';
import { LayoutsController } from './layouts.controller';
import { LayoutsService } from './layouts.service';

@Module({ controllers: [LayoutsController], providers: [LayoutsService] })
export class LayoutsModule {}
