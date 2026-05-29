/**
 * SEO domain types.
 *
 * The platform's organic growth strategy depends on programmatic
 * SEO: thousands of long-tail "from X to Y" landings + per-area
 * hubs + per-station and per-line pages, all server-rendered so
 * search engines see real HTML.
 *
 * The frozen frontend cannot host these routes (it is locked), so
 * we render them from the backend behind /api/seo/* and let the
 * Cloudflare worker (or Caddy) rewrite public-facing paths to
 * these endpoints for crawler User-Agents.
 */
export type SeoSection = 'index' | 'areas' | 'from-to' | 'stations' | 'lines';

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
  /** Daily / weekly / monthly — coarse hint to crawlers. */
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  /** 0.0..1.0 priority. Defaults differ per section. */
  priority?: number;
  /** Optional alternate language URLs for hreflang. */
  alternates?: Array<{ hreflang: string; href: string }>;
}
