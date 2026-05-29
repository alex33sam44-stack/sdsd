import { Injectable } from '@nestjs/common';
import { I18nService } from '../../common/i18n/i18n.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EGYPT_CATALOG, type CatalogEntry } from '../local-search/local-search.catalog';
import type { SitemapEntry } from './seo.types';

const LOCALES = ['ar', 'en', 'fr', 'pt'] as const;
type Locale = (typeof LOCALES)[number];

const TOP_FROMTO_PAIRS: Array<[string, string]> = [
  ['cairo', 'alexandria'],
  ['cairo', 'mansoura'],
  ['cairo', 'tanta'],
  ['cairo', 'ismailia'],
  ['cairo', 'suez'],
  ['cairo', 'port-said'],
  ['cairo', 'asyut'],
  ['cairo', 'minya'],
  ['cairo', 'luxor'],
  ['cairo', 'aswan'],
  ['cairo', 'red-sea'],
  ['cairo', 'sharm'],
  ['alexandria', 'cairo'],
  ['alexandria', 'mansoura'],
  ['alexandria', 'matruh'],
];

/**
 * Generates sitemaps + robots.txt + a small fleet of server-rendered
 * landing pages used by the programmatic SEO play.
 *
 * Every path here is content-typed for crawlers, never depends on
 * the SPA, and is multi-locale (ar/en/fr/pt) by hreflang.
 */
@Injectable()
export class SeoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  // ============================================================
  // Sitemap surface
  // ============================================================

  async renderSitemapIndex(): Promise<string> {
    const base = publicBase();
    const sections: Array<{ name: string; lastmod: string }> = [
      { name: 'areas', lastmod: today() },
      { name: 'from-to', lastmod: today() },
      { name: 'stations', lastmod: today() },
      { name: 'lines', lastmod: today() },
    ];
    const items = sections
      .map(
        (s) =>
          `  <sitemap>\n    <loc>${escapeXml(`${base}/api/seo/sitemap-${s.name}.xml`)}</loc>\n    <lastmod>${s.lastmod}</lastmod>\n  </sitemap>`,
      )
      .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>\n`;
  }

  async renderLeafSitemap(section: string): Promise<string | null> {
    if (section === 'areas') return this.sitemap(this.areaEntries());
    if (section === 'from-to') return this.sitemap(this.fromToEntries());
    if (section === 'stations') return this.sitemap(await this.stationEntries());
    if (section === 'lines') return this.sitemap(await this.lineEntries());
    return null;
  }

  renderRobots(): string {
    const base = publicBase();
    return [
      'User-agent: *',
      'Allow: /',
      'Disallow: /admin',
      'Disallow: /api/auth',
      `Sitemap: ${base}/api/seo/sitemap.xml`,
      '',
    ].join('\n');
  }

  // ============================================================
  // Programmatic landings
  // ============================================================

  async renderFromTo(fromSlug: string, toSlug: string, locale: string): Promise<string | null> {
    const from = this.findCatalog(fromSlug);
    const to = this.findCatalog(toSlug);
    if (!from || !to) return null;
    const lc = this.normLocale(locale);
    const titleAr = `من ${from.name} إلى ${to.name} — السعر، الوقت، الخط الصح`;
    const introAr = `ابحث عن أسرع وأرخص طريقة للوصول من ${from.name} إلى ${to.name}: تردد العربيات، السعر التقديري، والمسار الكامل بكل المواقف.`;
    const title = await this.t(titleAr, lc);
    const intro = await this.t(introAr, lc);

    const intercity = await this.intercityForPair(from.id, to.id);
    const intercityRows = await Promise.all(
      intercity.map(async (r) => {
        const carrierLocalized = await this.t(r.carrier, lc);
        const minutes = r.duration_minutes ?? '';
        const fareMin = r.fare_min ?? '';
        const fareMax = r.fare_max ?? '';
        return `      <tr><td>${escapeHtml(carrierLocalized)}</td><td>${escapeHtml(String(r.vehicle_type ?? ''))}</td><td>${escapeHtml(String(minutes))} min</td><td>${escapeHtml(String(fareMin))}–${escapeHtml(String(fareMax))} EGP</td></tr>`;
      }),
    );

    const noRoutesText = await this.t('لا توجد رحلات مسجلة بعد بين هذين الموقعين.', lc);
    const carrierLabel = await this.t('الناقل', lc);
    const vehicleLabel = await this.t('المركبة', lc);
    const durationLabel = await this.t('المدة', lc);
    const fareLabel = await this.t('السعر', lc);
    const transportHeading = await this.t('وسائل النقل المتاحة', lc);
    const ctaLabel = await this.t('خطط رحلتك الآن', lc);

    return this.htmlPage({
      lang: lc,
      title,
      description: intro,
      canonical: `${publicBase()}/api/seo/from/${encodeURIComponent(fromSlug)}/to/${encodeURIComponent(toSlug)}`,
      altPath: `from/${encodeURIComponent(fromSlug)}/to/${encodeURIComponent(toSlug)}`,
      ogTitle: title,
      ogDescription: intro,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'TravelAction',
        fromLocation: { '@type': 'Place', name: from.name },
        toLocation: { '@type': 'Place', name: to.name },
      },
      bodyHtml: `
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(intro)}</p>
  <h2>${escapeHtml(transportHeading)}</h2>
  ${
    intercityRows.length
      ? `<table><thead><tr><th>${escapeHtml(carrierLabel)}</th><th>${escapeHtml(vehicleLabel)}</th><th>${escapeHtml(durationLabel)}</th><th>${escapeHtml(fareLabel)}</th></tr></thead><tbody>\n${intercityRows.join('\n')}\n      </tbody></table>`
      : `<p>${escapeHtml(noRoutesText)}</p>`
  }
  <p><a href="/planner?from=${encodeURIComponent(fromSlug)}&amp;to=${encodeURIComponent(toSlug)}">${escapeHtml(ctaLabel)}</a></p>
      `,
    });
  }

  async renderArea(slug: string, locale: string): Promise<string | null> {
    const area = this.findCatalog(slug);
    if (!area) return null;
    const lc = this.normLocale(locale);
    const titleAr = `${area.name} — كل المواصلات بالأسعار والمواعيد`;
    const introAr = `دليل ${area.name} بكل المواقف، الخطوط، الأسعار، وتجارب الناس على الأرض.`;
    const title = await this.t(titleAr, lc);
    const intro = await this.t(introAr, lc);

    const stations = await this.stationsNear(area.lat, area.lng);
    const stationItems = await Promise.all(
      stations.map(async (s) => `<li><a href="/station/${s.id}">${escapeHtml(await this.t(s.name, lc))}</a></li>`),
    );
    const nearbyHeading = await this.t('المواقف القريبة', lc);
    const emptyMessage = await this.t('لم تُسجَّل مواقف بعد', lc);

    return this.htmlPage({
      lang: lc,
      title,
      description: intro,
      canonical: `${publicBase()}/api/seo/area/${encodeURIComponent(slug)}`,
      altPath: `area/${encodeURIComponent(slug)}`,
      ogTitle: title,
      ogDescription: intro,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'Place',
        name: area.name,
        geo: { '@type': 'GeoCoordinates', latitude: area.lat, longitude: area.lng },
      },
      bodyHtml: `
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(intro)}</p>
  <h2>${escapeHtml(nearbyHeading)}</h2>
  <ul>\n${stationItems.join('\n') || `<li>${escapeHtml(emptyMessage)}</li>`}\n  </ul>
      `,
    });
  }

  // ============================================================
  // helpers
  // ============================================================

  private async sitemap(entries: SitemapEntry[]): Promise<string> {
    const items = entries
      .map((e) => {
        const alt = (e.alternates ?? [])
          .map(
            (a) =>
              `      <xhtml:link rel="alternate" hreflang="${escapeXml(a.hreflang)}" href="${escapeXml(a.href)}"/>`,
          )
          .join('\n');
        return `  <url>\n    <loc>${escapeXml(e.loc)}</loc>\n    <lastmod>${e.lastmod ?? today()}</lastmod>\n    <changefreq>${e.changefreq ?? 'weekly'}</changefreq>\n    <priority>${(e.priority ?? 0.5).toFixed(1)}</priority>${alt ? '\n' + alt : ''}\n  </url>`;
      })
      .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${items}\n</urlset>\n`;
  }

  private areaEntries(): SitemapEntry[] {
    const base = publicBase();
    return EGYPT_CATALOG.map((entry) => ({
      loc: `${base}/api/seo/area/${entry.id}`,
      changefreq: 'weekly',
      priority: 0.7,
      alternates: LOCALES.map((l) => ({
        hreflang: l,
        href: `${base}/api/seo/area/${entry.id}?lang=${l}`,
      })),
    }));
  }

  private fromToEntries(): SitemapEntry[] {
    const base = publicBase();
    return TOP_FROMTO_PAIRS.map(([from, to]) => ({
      loc: `${base}/api/seo/from/${from}/to/${to}`,
      changefreq: 'daily',
      priority: 0.8,
      alternates: LOCALES.map((l) => ({
        hreflang: l,
        href: `${base}/api/seo/from/${from}/to/${to}?lang=${l}`,
      })),
    }));
  }

  private async stationEntries(): Promise<SitemapEntry[]> {
    const base = publicBase();
    const stations = await this.prisma.station.findMany({
      where: { isPublished: true },
      select: { id: true, updatedAt: true },
      take: 5000,
    });
    return stations.map((s) => ({
      loc: `${base}/station/${s.id}`,
      lastmod: s.updatedAt.toISOString().slice(0, 10),
      changefreq: 'weekly',
      priority: 0.5,
    }));
  }

  private async lineEntries(): Promise<SitemapEntry[]> {
    const base = publicBase();
    const lines = await this.prisma.line.findMany({
      where: { isPublished: true },
      select: { id: true, stationId: true, updatedAt: true },
      take: 5000,
    });
    return lines.map((l) => ({
      loc: `${base}/route/${l.stationId}/${l.id}`,
      lastmod: l.updatedAt.toISOString().slice(0, 10),
      changefreq: 'weekly',
      priority: 0.5,
    }));
  }

  private async intercityForPair(fromCityId: string, toCityId: string): Promise<any[]> {
    try {
      const fromRow = await this.resolveCityId(fromCityId);
      const toRow = await this.resolveCityId(toCityId);
      if (!fromRow || !toRow) return [];
      return (await this.prisma.$queryRawUnsafe(
        `SELECT * FROM intercity_routes
          WHERE is_published = TRUE AND from_city_id = ? AND to_city_id = ?
          ORDER BY duration_minutes ASC LIMIT 8`,
        fromRow,
        toRow,
      )) as any[];
    } catch {
      return [];
    }
  }

  private async resolveCityId(slugOrId: string): Promise<string | null> {
    try {
      const rows = (await this.prisma.$queryRawUnsafe(
        `SELECT id FROM cities WHERE id = ? OR slug = ? LIMIT 1`,
        slugOrId,
        slugOrId,
      )) as Array<{ id: string }>;
      return rows[0]?.id ?? null;
    } catch {
      return null;
    }
  }

  private async stationsNear(lat: number, lng: number) {
    const span = 0.05; // ~5.5km at Cairo's latitude
    const stations = await this.prisma.station.findMany({
      where: {
        isPublished: true,
        lat: { gte: lat - span, lte: lat + span },
        lng: { gte: lng - span, lte: lng + span },
      },
      select: { id: true, name: true, lat: true, lng: true },
      take: 20,
    });
    return stations;
  }

  private findCatalog(slug: string): CatalogEntry | undefined {
    return EGYPT_CATALOG.find((e) => e.id === slug);
  }

  private normLocale(value: string): Locale {
    const short = value.toLowerCase().split(/[-_]/)[0];
    return (LOCALES as readonly string[]).includes(short) ? (short as Locale) : 'ar';
  }

  private async t(text: string, locale: Locale): Promise<string> {
    if (locale === 'ar') return text;
    return this.i18n.translateText(text, locale);
  }

  private htmlPage(args: {
    lang: Locale;
    title: string;
    description: string;
    canonical: string;
    altPath: string;
    ogTitle: string;
    ogDescription: string;
    jsonLd: Record<string, unknown>;
    bodyHtml: string;
  }): string {
    const dir = args.lang === 'ar' ? 'rtl' : 'ltr';
    const alt = LOCALES.map(
      (l) =>
        `  <link rel="alternate" hreflang="${l}" href="${escapeXml(`${publicBase()}/api/seo/${args.altPath}?lang=${l}`)}"/>`,
    ).join('\n');
    const xDefault = `  <link rel="alternate" hreflang="x-default" href="${escapeXml(args.canonical)}"/>`;
    return `<!doctype html>
<html lang="${args.lang}" dir="${dir}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(args.title)}</title>
  <meta name="description" content="${escapeHtml(args.description)}"/>
  <link rel="canonical" href="${escapeXml(args.canonical)}"/>
${alt}
${xDefault}
  <meta property="og:title" content="${escapeHtml(args.ogTitle)}"/>
  <meta property="og:description" content="${escapeHtml(args.ogDescription)}"/>
  <meta property="og:type" content="website"/>
  <meta property="og:locale" content="${args.lang}"/>
  <meta name="twitter:card" content="summary_large_image"/>
  <script type="application/ld+json">${JSON.stringify(args.jsonLd)}</script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Cairo", sans-serif; max-width: 760px; margin: 2rem auto; padding: 0 1rem; line-height: 1.55; color: #111; }
    h1 { font-size: 1.75rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.2rem; margin-top: 2rem; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
    th, td { border-bottom: 1px solid #eaeaea; padding: 0.5rem 0.4rem; text-align: ${dir === 'rtl' ? 'right' : 'left'}; }
    a { color: #0b6cf6; }
  </style>
</head>
<body data-mw-i18n="ignore">
${args.bodyHtml}
</body>
</html>`;
  }
}

function publicBase(): string {
  const explicit = process.env.PUBLIC_APP_URL ?? process.env.APP_REDIRECT_URI;
  if (explicit) return explicit.replace(/\/$/, '');
  const domain = process.env.APP_DOMAIN;
  return domain ? `https://${domain}` : 'https://mwasalat.app';
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function escapeXml(value: string): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function escapeHtml(value: string): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
