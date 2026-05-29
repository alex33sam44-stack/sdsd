/**
 * Localization types and constants used across the backend.
 *
 * Locales: 'ar' (Egyptian Arabic — source of truth), 'en' (English),
 * 'fr' (French). Adding a locale requires extending SUPPORTED_LOCALES
 * and shipping translations or relying on the runtime translator.
 */
export type Locale = 'ar' | 'en' | 'fr';

export const SUPPORTED_LOCALES: readonly Locale[] = ['ar', 'en', 'fr'] as const;
export const DEFAULT_LOCALE: Locale = 'ar';
export const SOURCE_LOCALE: Locale = 'ar';

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
