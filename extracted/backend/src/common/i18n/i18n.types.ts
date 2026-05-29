/**
 * Localization types and constants used across the backend.
 *
 * Locales:
 *   'ar' — Egyptian Arabic, the source of truth for hard-coded UI
 *           text and DB content.
 *   'en' — English, the i18next fallback target for the frozen SPA.
 *   'fr' — French.
 *   'pt' — Portuguese (Brazil/PT). Added later via the runtime layer
 *           without touching the frozen frontend; relies on the DOM
 *           overlay + response interceptor for full coverage.
 *
 * Adding a locale requires extending SUPPORTED_LOCALES, declaring it
 * in the OpenAI provider's `langName` map, listing it in the overlay
 * JS `SUPPORTED` array, and (optionally) seeding curated overrides.
 */
export type Locale = 'ar' | 'en' | 'fr' | 'pt';

export const SUPPORTED_LOCALES: readonly Locale[] = ['ar', 'en', 'fr', 'pt'] as const;
export const DEFAULT_LOCALE: Locale = 'ar';
export const SOURCE_LOCALE: Locale = 'ar';

/**
 * Locales whose strings the DOM overlay should translate when seen
 * as raw text in the rendered DOM. The frozen SPA falls back to
 * English when a locale is not in its bundled resources, so for any
 * non-English target we must accept BOTH Arabic (from hard-coded
 * literals) and English (from i18next fallback) as valid sources.
 */
export const SECONDARY_SOURCE_LOCALES: readonly Locale[] = ['ar', 'en'] as const;

export const LOCALE_COOKIE = 'mw_locale';
export const LOCALE_HEADER = 'x-locale';
export const LOCALE_QUERY = 'lang';

/**
 * Fields on each entity type that should be translated when a non-source
 * locale is requested. Keep names in sync with Prisma model fields.
 *
 * `City` is included even though slugs stay stable: only the human
 * `name` is translated. `RouteStop.name` covers stop labels. `Line`
 * uses `destination` and `pickupArea`. Free-text fields like
 * `StationLayout.notes` are also covered.
 */
export const TRANSLATABLE_FIELDS: Record<string, readonly string[]> = {
  Station: ['name', 'area'],
  Line: ['destination', 'pickupArea'],
  RouteStop: ['name'],
  City: ['name'],
  StationLayout: ['notes'],
  LayoutZone: ['label'],
  Favorite: ['label'],
  Tenant: ['name'],
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

declare module 'express-serve-static-core' {
  interface Request {
    locale?: Locale;
  }
}
