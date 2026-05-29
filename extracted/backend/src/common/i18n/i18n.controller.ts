import { Body, Controller, Get, Header, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { I18nService } from './i18n.service';
import { DEFAULT_LOCALE, isLocale, Locale, SUPPORTED_LOCALES } from './i18n.types';

/**
 * Public translation endpoints.
 *
 *   GET  /api/i18n/locales           — supported locale list (cacheable)
 *   GET  /api/i18n/overrides         — runtime DOM overlay dictionary
 *   GET  /api/i18n/translate         — single phrase translation
 *   POST /api/i18n/translate-batch   — bulk phrase translation (≤500 items)
 *   GET  /api/i18n/runtime.js        — JS overlay loaded by index.html
 */
@Controller('i18n')
export class I18nController {
  constructor(private readonly i18n: I18nService) {}

  @Get('locales')
  @Header('Cache-Control', 'public, max-age=3600')
  @Header('x-i18n-skip', '1')
  locales(): { locales: readonly Locale[]; default: Locale } {
    return { locales: SUPPORTED_LOCALES, default: DEFAULT_LOCALE };
  }

  @Get('overrides')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=600')
  @Header('x-i18n-skip', '1')
  async overrides(@Req() req: Request, @Query('locale') localeRaw?: string) {
    const target = isLocale(localeRaw) ? (localeRaw as Locale) : (req.locale ?? DEFAULT_LOCALE);
    const tenantId = (req as any).tenantId ?? null;
    const dictionary = await this.i18n.getOverrideBundle(target, tenantId);
    return { locale: target, count: Object.keys(dictionary).length, dictionary };
  }

  @Get('translate')
  @Header('x-i18n-skip', '1')
  async translateOne(
    @Req() req: Request,
    @Query('text') text: string,
    @Query('to') to?: string,
    @Query('from') from?: string,
  ) {
    const target = isLocale(to) ? (to as Locale) : (req.locale ?? DEFAULT_LOCALE);
    const source = isLocale(from) ? (from as Locale) : 'ar';
    if (!text) return { text: '', translated: '', from: source, to: target };
    const translated = await this.i18n.translateText(text, target, {
      from: source,
      tenantId: (req as any).tenantId ?? null,
    });
    return { text, translated, from: source, to: target };
  }

  @Post('translate-batch')
  @Header('x-i18n-skip', '1')
  async translateMany(
    @Req() req: Request,
    @Body() body: { items?: string[]; to?: string; from?: string },
  ) {
    const target = isLocale(body.to) ? (body.to as Locale) : (req.locale ?? DEFAULT_LOCALE);
    const source = isLocale(body.from) ? (body.from as Locale) : 'ar';
    const items = (body.items ?? []).slice(0, 500);
    const tenantId = (req as any).tenantId ?? null;
    const out = await Promise.all(
      items.map(async (text) => {
        if (!text || target === source) return text;
        return this.i18n.translateText(text, target, { from: source, tenantId });
      }),
    );
    return { from: source, to: target, items: out };
  }

  /**
   * Runtime overlay shipped to the browser. Injected via Caddy into
   * index.html (see Caddyfile `@spa` block) so it loads BEFORE the
   * Vite app bundle. It listens for locale changes (cookie / custom
   * event), patches DOM text nodes after each render, and pre-fetches
   * the override dictionary.
   *
   * The frontend codebase is frozen — this script is the only way to
   * translate hard-coded Arabic strings without violating the freeze.
   */
  @Get('runtime.js')
  @Header('Content-Type', 'application/javascript; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400')
  @Header('x-i18n-skip', '1')
  runtime(): string {
    return I18N_RUNTIME_SOURCE;
  }
}

/* eslint-disable max-len */
const I18N_RUNTIME_SOURCE = `// mwasalat i18n runtime overlay — loaded into index.html via Caddy
// The frontend is frozen; this script patches visible text strings
// to the user's chosen locale at runtime by intercepting DOM mutations
// and outbound fetch responses.
//
// Source detection: the SPA bundles ar/en/fr resources only. For any
// target outside that set (e.g. 'pt'), the SPA falls back to English,
// so the overlay must treat BOTH Arabic AND English as translatable
// sources. For ar/en/fr targets we still translate Arabic → target.
(function () {
  if (window.__MW_I18N__) return;
  var COOKIE = 'mw_locale';
  var STORAGE = 'mw_locale';
  var EVENT = 'mw:locale-change';
  var DEFAULT = 'ar';
  var SUPPORTED = ['ar', 'en', 'fr', 'pt'];
  // Locales whose DOM rendering is fully shipped by the frozen SPA.
  // For any locale NOT in this set, English is also accepted as a
  // source language (the SPA falls back to en for unsupported locales).
  var FROZEN_BUNDLED = ['ar', 'en', 'fr'];

  function getCookie(name) {
    var m = document.cookie.match('(?:^|;\\\\s*)' + name + '=([^;]*)');
    return m ? decodeURIComponent(m[1]) : null;
  }
  function setCookie(name, value) {
    var maxAge = 60 * 60 * 24 * 365;
    document.cookie = name + '=' + encodeURIComponent(value) + '; path=/; max-age=' + maxAge + '; SameSite=Lax';
  }
  function detect() {
    try {
      var qs = new URLSearchParams(location.search).get('lang');
      if (qs && SUPPORTED.indexOf(qs) !== -1) return qs;
    } catch (e) {}
    var fromStorage = null;
    try { fromStorage = localStorage.getItem(STORAGE); } catch (e) {}
    if (fromStorage && SUPPORTED.indexOf(fromStorage) !== -1) return fromStorage;
    var fromCookie = getCookie(COOKIE);
    if (fromCookie && SUPPORTED.indexOf(fromCookie) !== -1) return fromCookie;
    var nav = (navigator.language || 'ar').slice(0, 2).toLowerCase();
    return SUPPORTED.indexOf(nav) !== -1 ? nav : DEFAULT;
  }

  var current = detect();
  setCookie(COOKIE, current);
  try { localStorage.setItem(STORAGE, current); } catch (e) {}
  // Also mirror to the SPA's own storage key so i18next picks up the
  // locale on next render. Frozen frontend uses 'app.lang'.
  try { localStorage.setItem('app.lang', current); } catch (e) {}
  document.documentElement.lang = current;
  document.documentElement.dir = current === 'ar' ? 'rtl' : 'ltr';

  // ---- override dictionary (populated from /api/i18n/overrides) ----
  var dict = {};         // { sourceText -> translatedText }
  var pending = {};      // { sourceText -> Promise<string> }
  var nodeMap = new WeakMap();

  function fetchOverrides() {
    if (current === DEFAULT) { dict = {}; return Promise.resolve({}); }
    return fetch('/api/i18n/overrides?locale=' + encodeURIComponent(current), {
      headers: { 'x-locale': current, 'x-i18n-skip': '1' },
      credentials: 'same-origin'
    }).then(function (r) { return r.ok ? r.json() : { dictionary: {} }; })
      .then(function (data) { dict = data.dictionary || {}; return dict; })
      .catch(function () { return {}; });
  }

  // Treat both Arabic and (when target is unbundled, e.g. pt) English
  // as translatable source text. We can't accept Latin text for ar/en/
  // fr targets because that would translate already-localized strings.
  function looksTranslatable(text) {
    if (!text) return false;
    var t = text.trim();
    if (!t || t.length > 600) return false;
    if (/^[\\d\\s.,:;%+\\-/()$£€]+$/.test(t)) return false;
    if (/^https?:\\/\\//.test(t)) return false;
    if (/^[\\w.+-]+@[\\w.-]+$/.test(t)) return false;
    var hasArabic = /[\\u0600-\\u06FF]/.test(t);
    if (hasArabic) return true;
    // Latin source — only when target locale is NOT bundled by the SPA.
    if (FROZEN_BUNDLED.indexOf(current) !== -1) return false;
    // require at least one ASCII letter and >=2 chars
    return /[a-zA-Z]/.test(t) && t.length >= 2;
  }

  function translateText(text) {
    var key = text.trim();
    if (!key) return Promise.resolve(text);
    if (dict[key] != null) return Promise.resolve(swapWhitespace(text, key, dict[key]));
    if (pending[key]) return pending[key].then(function (out) { return swapWhitespace(text, key, out); });
    // Hint the source: Arabic letters → ar, otherwise → en (frozen
    // SPA's i18next fallback). The backend autodetects too but the
    // hint reduces a hop on the hot path.
    var fromHint = /[\\u0600-\\u06FF]/.test(key) ? 'ar' : 'en';
    var url = '/api/i18n/translate?text=' + encodeURIComponent(key) +
              '&to=' + current + '&from=' + fromHint;
    pending[key] = fetch(url, {
      headers: { 'x-locale': current, 'x-i18n-skip': '1' },
      credentials: 'same-origin'
    }).then(function (r) { return r.ok ? r.json() : { translated: key }; })
      .then(function (data) { dict[key] = data.translated || key; return dict[key]; })
      .catch(function () { return key; });
    return pending[key].then(function (out) { return swapWhitespace(text, key, out); });
  }

  function swapWhitespace(original, key, translated) {
    var leading = original.match(/^\\s*/)[0];
    var trailing = original.match(/\\s*$/)[0];
    return leading + translated + trailing;
  }

  function patchTextNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return;
    var original = nodeMap.get(node);
    var current = node.nodeValue;
    if (!original) {
      if (!looksTranslatable(current)) return;
      original = current;
      nodeMap.set(node, original);
    }
    translateText(original).then(function (out) {
      if (node.nodeValue !== out) node.nodeValue = out;
    });
  }

  function patchAttribute(el, attr) {
    var value = el.getAttribute(attr);
    if (!value || !looksTranslatable(value)) return;
    var stored = el.__mwI18n = el.__mwI18n || {};
    if (!stored[attr]) stored[attr] = value;
    translateText(stored[attr]).then(function (out) {
      if (el.getAttribute(attr) !== out) el.setAttribute(attr, out);
    });
  }

  function walk(root) {
    if (current === DEFAULT) return;
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) { patchTextNode(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    if (root.closest && root.closest('[data-mw-i18n="ignore"]')) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.parentNode) return NodeFilter.FILTER_REJECT;
        var p = n.parentNode;
        var tag = (p.nodeName || '').toLowerCase();
        if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'code' || tag === 'pre') {
          return NodeFilter.FILTER_REJECT;
        }
        if (p.closest && p.closest('[data-mw-i18n="ignore"]')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var n;
    while ((n = walker.nextNode())) patchTextNode(n);
    var attrs = ['placeholder', 'title', 'aria-label', 'alt', 'value'];
    var withAttr = root.querySelectorAll('[placeholder],[title],[aria-label],[alt],input[value]');
    for (var i = 0; i < withAttr.length; i++) {
      for (var j = 0; j < attrs.length; j++) patchAttribute(withAttr[i], attrs[j]);
    }
  }

  // ---- intercept fetch to inject x-locale header ----
  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    init = init || {};
    init.headers = new Headers(init.headers || (input && input.headers) || {});
    if (!init.headers.has('x-locale')) init.headers.set('x-locale', current);
    return origFetch(input, init);
  };

  // ---- mutation observer for SPA renders ----
  var observer;
  function startObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(function (mutations) {
      if (current === DEFAULT) return;
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === 'characterData') patchTextNode(m.target);
        else if (m.type === 'childList') {
          for (var j = 0; j < m.addedNodes.length; j++) walk(m.addedNodes[j]);
        } else if (m.type === 'attributes') {
          patchAttribute(m.target, m.attributeName);
        }
      }
    });
    observer.observe(document.documentElement, {
      subtree: true, childList: true, characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'title', 'aria-label', 'alt', 'value']
    });
  }

  function applyAll() {
    document.documentElement.lang = current;
    document.documentElement.dir = current === 'ar' ? 'rtl' : 'ltr';
    if (current === DEFAULT) {
      // Reset every captured node back to its original text
      // (handled by full page reload via setLocale)
      return;
    }
    walk(document.body || document.documentElement);
  }

  function setLocale(next) {
    if (SUPPORTED.indexOf(next) === -1) return;
    if (next === current) return;
    var prev = current;
    current = next;
    setCookie(COOKIE, next);
    try { localStorage.setItem(STORAGE, next); } catch (e) {}
    // Mirror to SPA's i18next storage key so the frozen frontend
    // re-renders in the new locale on its next render cycle.
    try { localStorage.setItem('app.lang', next); } catch (e) {}
    // Switching between SPA-bundled locales (ar/en/fr) needs a hard
    // reload so i18next picks up the change AND so previously-
    // translated DOM nodes revert to source text. Switching to/from
    // 'pt' or any unbundled locale: same — the SPA renders English
    // and the overlay re-translates.
    if (FROZEN_BUNDLED.indexOf(next) !== -1 || FROZEN_BUNDLED.indexOf(prev) !== -1) {
      location.reload();
      return;
    }
    fetchOverrides().then(applyAll);
    document.dispatchEvent(new CustomEvent(EVENT, { detail: { locale: next } }));
  }

  window.__MW_I18N__ = {
    locale: function () { return current; },
    setLocale: setLocale,
    refresh: function () { fetchOverrides().then(applyAll); },
    supported: SUPPORTED.slice(),
  };
  // legacy/global hook for the SPA
  window.setMwasalatLocale = setLocale;

  // Boot
  fetchOverrides().then(function () {
    startObserver();
    applyAll();
    document.addEventListener('readystatechange', function () {
      if (document.readyState === 'complete') applyAll();
    });
  });
})();
`;
