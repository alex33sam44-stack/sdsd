import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import {
  DEFAULT_LOCALE,
  isLocale,
  Locale,
  LOCALE_COOKIE,
  LOCALE_HEADER,
  LOCALE_QUERY,
  SUPPORTED_LOCALES,
} from './i18n.types';

/**
 * Resolves the active locale for a request using the following order:
 *   1. `?lang=` query string (highest priority — explicit user action)
 *   2. `x-locale` HTTP header (set by the SPA on every fetch)
 *   3. `mw_locale` cookie (sticky preference)
 *   4. Accept-Language header (browser default)
 *   5. DEFAULT_LOCALE
 *
 * The resolved locale is attached to `req.locale` and echoed back via
 * the `Content-Language` and `x-locale` response headers so caches
 * (Caddy/CDN) can vary correctly.
 */
@Injectable()
export class LocaleResolverMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const fromQuery = pickLocale(req.query?.[LOCALE_QUERY]);
    const fromHeader = pickLocale(req.headers[LOCALE_HEADER]);
    const fromCookie = pickLocale(req.cookies?.[LOCALE_COOKIE]);
    const fromAcceptLanguage = parseAcceptLanguage(req.headers['accept-language']);

    const locale: Locale =
      fromQuery ?? fromHeader ?? fromCookie ?? fromAcceptLanguage ?? DEFAULT_LOCALE;

    req.locale = locale;
    res.setHeader('Content-Language', locale);
    res.setHeader('x-locale', locale);
    res.setHeader('Vary', mergeVary(res.getHeader('Vary'), 'x-locale, Accept-Language, Cookie'));
    next();
  }
}

function pickLocale(raw: unknown): Locale | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().slice(0, 5);
  if (isLocale(normalized)) return normalized;
  // accept "en-US" → "en"
  const short = normalized.split(/[-_]/)[0];
  return isLocale(short) ? (short as Locale) : null;
}

function parseAcceptLanguage(header: string | undefined): Locale | null {
  if (!header) return null;
  const parts = header
    .split(',')
    .map((p) => {
      const [tag, q] = p.trim().split(';q=');
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q) : 1 };
    })
    .filter((p) => p.tag)
    .sort((a, b) => b.q - a.q);
  for (const part of parts) {
    const short = part.tag.split('-')[0];
    if (isLocale(short)) return short as Locale;
  }
  return null;
}

function mergeVary(existing: string | number | string[] | undefined, addition: string): string {
  const current = (Array.isArray(existing) ? existing.join(', ') : (existing ?? '')).toString();
  const tokens = new Set(
    [...current.split(','), ...addition.split(',')].map((t) => t.trim()).filter(Boolean),
  );
  return [...tokens].join(', ');
}

export function _supportedLocalesSnapshot(): readonly Locale[] {
  return SUPPORTED_LOCALES;
}
