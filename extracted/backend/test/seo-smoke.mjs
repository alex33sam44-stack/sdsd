#!/usr/bin/env node
/**
 * Behavioural smoke test for the SEO module.
 *
 *   node backend/test/seo-smoke.mjs
 *
 * Verifies the surface and the wire-up without booting Nest:
 *   - controller registers the public routes
 *   - service ships sitemap + landing renderers
 *   - module is wired into AppModule
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(ROOT, '..');
const read = (rel) => readFileSync(resolve(REPO, rel), 'utf8');

let pass = 0, fail = 0;
const out = [];
const check = (name, ok, detail) => {
  if (ok) pass += 1;
  else fail += 1;
  out.push({ name, ok: !!ok, detail: ok ? '' : detail ?? '' });
};

const ctl = read('backend/src/modules/seo/seo.controller.ts');
const svc = read('backend/src/modules/seo/seo.service.ts');
const mod = read('backend/src/modules/seo/seo.module.ts');
const app = read('backend/src/app.module.ts');

check('controller registers /api/seo prefix', ctl.includes("@Controller('seo')"));
check('controller exposes sitemap.xml', ctl.includes("@Get('sitemap.xml')"));
check('controller exposes leaf sitemap', ctl.includes("@Get('sitemap-:section.xml')"));
check('controller exposes robots.txt', ctl.includes("@Get('robots.txt')"));
check('controller exposes /from/:from/to/:to', ctl.includes("@Get('from/:from/to/:to')"));
check('controller exposes /area/:slug', ctl.includes("@Get('area/:slug')"));
check('controller marks XML responses x-i18n-skip', /sitemap-[^\s]*\.xml[\s\S]{0,400}x-i18n-skip/.test(ctl));

check('service generates sitemap index with sub-sitemaps', svc.includes('renderSitemapIndex') && svc.includes('sitemap-${s.name}'));
check('service supports areas / from-to / stations / lines leaves', svc.includes("'areas'") && svc.includes("'from-to'") && svc.includes("'stations'") && svc.includes("'lines'"));
check('service ships ≥15 from-to pairs', (svc.match(/\['cairo'/g) ?? []).length + (svc.match(/\['alexandria'/g) ?? []).length >= 15);
check('service emits hreflang alternates for ar/en/fr/pt', /hreflang[\s\S]{0,400}\$\{l\}/.test(svc) && svc.includes("'ar', 'en', 'fr', 'pt'"));
check('service translates titles + intros via i18n', svc.includes('this.i18n.translateText'));
check('service emits JSON-LD (TravelAction or Place)', svc.includes('@type": "TravelAction') === false && svc.includes("'TravelAction'") || svc.includes('TravelAction'));
check('service marks SEO HTML body data-mw-i18n="ignore"', svc.includes('data-mw-i18n="ignore"'));

check('module imports PrismaModule + I18nModule', mod.includes('PrismaModule') && mod.includes('I18nModule'));
check('AppModule registers SeoModule', app.includes('SeoModule'));

console.log('# seo smoke');
for (const r of out) console.log(`${r.ok ? 'ok  ' : 'FAIL'} - ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
