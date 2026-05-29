import { Controller, Get, Header, NotFoundException, Param, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SeoService } from './seo.service';

/**
 * Public SEO surface.
 *
 *   GET /api/seo/sitemap.xml             — sitemap index (sub-sitemap list)
 *   GET /api/seo/sitemap-:section.xml    — leaf sitemap (areas | from-to | …)
 *   GET /api/seo/robots.txt              — robots.txt (with sitemap pointer)
 *   GET /api/seo/from/:from/to/:to       — programmatic landing HTML (server-rendered)
 *   GET /api/seo/area/:slug              — programmatic area landing HTML
 *
 * The HTML endpoints are server-rendered HTML strings — no SPA boot,
 * no JS required — so search engines and embedded social previews
 * always see fully resolved content.
 */
@Controller('seo')
export class SeoController {
  constructor(private readonly seo: SeoService) {}

  // ---------- Sitemap index ----------
  @Get('sitemap.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
  @Header('x-i18n-skip', '1')
  async sitemapIndex(): Promise<string> {
    return this.seo.renderSitemapIndex();
  }

  // ---------- Leaf sitemaps ----------
  @Get('sitemap-:section.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
  @Header('x-i18n-skip', '1')
  async leafSitemap(@Param('section') section: string): Promise<string> {
    const xml = await this.seo.renderLeafSitemap(section);
    if (!xml) throw new NotFoundException('Unknown sitemap section');
    return xml;
  }

  // ---------- robots.txt ----------
  @Get('robots.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  @Header('x-i18n-skip', '1')
  robots(): string {
    return this.seo.renderRobots();
  }

  // ---------- Programmatic landings ----------
  @Get('from/:from/to/:to')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600')
  async fromTo(
    @Req() req: Request,
    @Res() res: Response,
    @Param('from') from: string,
    @Param('to') to: string,
    @Query('lang') langOverride?: string,
  ): Promise<void> {
    const locale = (langOverride ?? (req as any).locale ?? 'ar') as string;
    const html = await this.seo.renderFromTo(from, to, locale);
    if (!html) {
      res.status(404).send('not found');
      return;
    }
    res.send(html);
  }

  @Get('area/:slug')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600')
  async area(
    @Req() req: Request,
    @Res() res: Response,
    @Param('slug') slug: string,
    @Query('lang') langOverride?: string,
  ): Promise<void> {
    const locale = (langOverride ?? (req as any).locale ?? 'ar') as string;
    const html = await this.seo.renderArea(slug, locale);
    if (!html) {
      res.status(404).send('not found');
      return;
    }
    res.send(html);
  }
}
