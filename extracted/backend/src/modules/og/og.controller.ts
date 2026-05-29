import { Controller, Get, Header, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { OgService } from './og.service';
import type { OgKind } from './og.types';

function normalizeKind(kind: string): OgKind {
  if (kind === 't' || kind === 'g' || kind === 'c') return kind;
  return 't';
}

@Controller('og')
export class OgController {
  constructor(private readonly og: OgService) {}

  @Get('preview/:kind/:tokenOrSlug')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async preview(@Param('kind') kind: string, @Param('tokenOrSlug') tokenOrSlug: string): Promise<string> {
    const preview = await this.og.buildPreview(normalizeKind(kind), tokenOrSlug);
    return this.og.renderHtml(preview);
  }

  @Get('image/:kind/:tokenOrSlug.svg')
  async image(
    @Param('kind') kind: string,
    @Param('tokenOrSlug') tokenOrSlug: string,
    @Res() res: Response,
  ): Promise<void> {
    const preview = await this.og.buildPreview(normalizeKind(kind), tokenOrSlug);
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    res.send(this.og.renderSvg(preview));
  }
}
