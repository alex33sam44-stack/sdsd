/**
 * Jest unit tests for the i18n stack. Pure logic, no external services.
 *
 * Runs as part of `npm --prefix backend test`. The companion smoke
 * runner in `test/i18n-smoke.mjs` covers the same logic without jest
 * (used by ad-hoc verification scripts).
 */
import { LocaleResolverMiddleware } from '../src/common/i18n/locale-resolver.middleware';
import {
  DEFAULT_LOCALE,
  isLocale,
  Locale,
  SOURCE_LOCALE,
  SUPPORTED_LOCALES,
  TRANSLATABLE_FIELDS,
} from '../src/common/i18n/i18n.types';
import { hashSource } from '../src/common/i18n/translation-providers';

function makeReq(p: any = {}) {
  return { query: {}, headers: {}, cookies: {}, ...p };
}
function makeRes() {
  const headers: Record<string, string | number | string[]> = {};
  return {
    headers,
    setHeader: (k: string, v: any) => {
      headers[k.toLowerCase()] = v;
    },
    getHeader: (k: string) => headers[k.toLowerCase()],
  };
}

describe('LocaleResolverMiddleware', () => {
  const mw = new LocaleResolverMiddleware();

  it('defaults to ar', () => {
    const req = makeReq();
    const res = makeRes();
    mw.use(req as any, res as any, () => undefined);
    expect(req.locale).toBe(DEFAULT_LOCALE);
    expect(res.headers['content-language']).toBe('ar');
  });

  it('?lang=en outranks every other signal', () => {
    const req = makeReq({
      query: { lang: 'en' },
      headers: { 'accept-language': 'fr', 'x-locale': 'fr' },
      cookies: { mw_locale: 'fr' },
    });
    mw.use(req as any, makeRes() as any, () => undefined);
    expect(req.locale).toBe('en');
  });

  it.each([
    [{ headers: { 'x-locale': 'fr' } }, 'fr'],
    [{ cookies: { mw_locale: 'fr' } }, 'fr'],
    [{ headers: { 'accept-language': 'fr-FR,fr;q=0.9,en;q=0.5' } }, 'fr'],
    [{ headers: { 'accept-language': 'en-US' } }, 'en'],
    [{ query: { lang: 'xx' }, headers: { 'accept-language': 'zh' } }, 'ar'],
  ])('resolves %p → %s', (input, expected) => {
    const req = makeReq(input);
    mw.use(req as any, makeRes() as any, () => undefined);
    expect(req.locale).toBe(expected);
  });

  it('sets Vary so caches segment per locale', () => {
    const req = makeReq({ query: { lang: 'en' } });
    const res = makeRes();
    mw.use(req as any, res as any, () => undefined);
    expect(String(res.headers.vary)).toMatch(/x-locale/i);
    expect(String(res.headers.vary)).toMatch(/accept-language/i);
  });
});

describe('hashSource', () => {
  it('is deterministic and 64-char hex', () => {
    const a = hashSource('محطة', 'ar');
    const b = hashSource('محطة', 'ar');
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });
  it('changes when source locale differs', () => {
    expect(hashSource('Station', 'en')).not.toBe(hashSource('Station', 'fr'));
  });
});

describe('TRANSLATABLE_FIELDS contract', () => {
  it.each(['Station', 'Line', 'RouteStop', 'City', 'StationLayout', 'LayoutZone'])(
    '%s has at least one translatable field',
    (entity) => {
      expect((TRANSLATABLE_FIELDS[entity] ?? []).length).toBeGreaterThan(0);
    },
  );
});

describe('isLocale', () => {
  it.each(SUPPORTED_LOCALES)('accepts %s', (l) => expect(isLocale(l)).toBe(true));
  it.each(['', 'xx', 'EN', null, 1])('rejects %p', (v: any) => expect(isLocale(v)).toBe(false));
});

describe('SOURCE_LOCALE', () => {
  it('is the platform default (ar)', () => {
    expect(SOURCE_LOCALE).toBe('ar');
    expect(DEFAULT_LOCALE).toBe('ar');
  });
});
