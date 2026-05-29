/**
 * Normalization + transliteration helpers for Egypt local search.
 *
 * Real users type in three scripts simultaneously:
 *   1. Arabic with/without diacritics  ("ميدان رمسيس", "ميدان رمسس")
 *   2. English transliteration         ("midan ramses", "ramses square")
 *   3. Franco-Arabic ("3arabizi")      ("ramsis", "rmses", "el ta7rir")
 *
 * Strategy: produce a normalized "search key" by
 *   - stripping Arabic diacritics, tatweel and presentation forms
 *   - unifying letter shapes (أإآ → ا, ى → ي, ة → ه, ؤئ → و/ي)
 *   - mapping franko digits (3 → ع, 7 → ح, 5 → خ, 2 → ء, 9 → ق)
 *     to their canonical Arabic letters
 *   - dropping the Arabic definite article "ال" when leading
 *   - collapsing repeated whitespace
 * Then we run a separate Latin → Arabic transliteration so a query
 * typed in English is matched against the Arabic name and vice-versa.
 */

const DIACRITICS = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const ARABIC_PRESENTATION = /[\uFB50-\uFDFF\uFE70-\uFEFF]/g;

const ARABIC_LETTER_FOLDS: Array<[RegExp, string]> = [
  [/[إأآٱ]/g, 'ا'],
  [/ى/g, 'ي'],
  [/ؤ/g, 'و'],
  [/ئ/g, 'ي'],
  [/ة/g, 'ه'],
  [/ـ/g, ''],
];

const FRANKO_DIGIT_TO_ARABIC: Record<string, string> = {
  '2': 'ء',
  '3': 'ع',
  '4': 'ش',
  '5': 'خ',
  '6': 'ط',
  '7': 'ح',
  '8': 'غ',
  '9': 'ق',
};

const LATIN_TO_ARABIC_BIGRAMS: Array<[RegExp, string]> = [
  [/sh/gi, 'ش'],
  [/kh/gi, 'خ'],
  [/gh/gi, 'غ'],
  [/th/gi, 'ث'],
  [/dh/gi, 'ذ'],
  [/aa/gi, 'ا'],
  [/ee/gi, 'ي'],
  [/oo/gi, 'و'],
  [/ou/gi, 'و'],
  [/ai/gi, 'اي'],
  [/ay/gi, 'اي'],
];

const LATIN_TO_ARABIC_LETTERS: Record<string, string> = {
  a: 'ا',
  b: 'ب',
  c: 'ك',
  d: 'د',
  e: 'ي',
  f: 'ف',
  g: 'ج',
  h: 'ه',
  i: 'ي',
  j: 'ج',
  k: 'ك',
  l: 'ل',
  m: 'م',
  n: 'ن',
  o: 'و',
  p: 'ب',
  q: 'ق',
  r: 'ر',
  s: 'س',
  t: 'ت',
  u: 'و',
  v: 'ف',
  w: 'و',
  x: 'كس',
  y: 'ي',
  z: 'ز',
};

const COMMON_ALIAS_FOLDS: Array<[RegExp, string]> = [
  [/\bميدان\b/g, ''],
  [/\bشارع\b/g, ''],
  [/\bكوبري\b/g, ''],
  [/\bمحطة\b/g, ''],
  [/\bموقف\b/g, ''],
  [/\bel\b/gi, ''],
  [/\bal\b/gi, ''],
  [/\bsquare\b/gi, ''],
  [/\bstreet\b/gi, ''],
  [/\bstation\b/gi, ''],
  [/\bbridge\b/gi, ''],
  [/\bplace\b/gi, ''],
];

export function normalizeArabic(input: string): string {
  let out = input ?? '';
  out = out.replace(ARABIC_PRESENTATION, '');
  out = out.replace(DIACRITICS, '');
  for (const [re, sub] of ARABIC_LETTER_FOLDS) out = out.replace(re, sub);
  // strip leading "ال"
  out = out.replace(/(^|\s)ال/g, '$1');
  return out;
}

export function transliterateLatinToArabic(input: string): string {
  let out = (input ?? '').toLowerCase();
  out = out.replace(/[^a-z0-9\s\u0600-\u06FF]/g, ' ');
  // franko digits first (so "3arabia" → "عarabia" → "عربيه")
  for (const [d, a] of Object.entries(FRANKO_DIGIT_TO_ARABIC)) {
    out = out.replaceAll(d, a);
  }
  for (const [re, sub] of LATIN_TO_ARABIC_BIGRAMS) out = out.replace(re, sub);
  let result = '';
  for (const ch of out) {
    if (ch >= '\u0600' && ch <= '\u06FF') {
      result += ch;
    } else if (LATIN_TO_ARABIC_LETTERS[ch]) {
      result += LATIN_TO_ARABIC_LETTERS[ch];
    } else if (ch === ' ' || ch === '\t') {
      result += ' ';
    }
  }
  return result;
}

export function normalize(input: string): string {
  const arabicized =
    /[a-zA-Z0-9]/.test(input) && !/[\u0600-\u06FF]{3}/.test(input)
      ? transliterateLatinToArabic(input)
      : input;
  let out = normalizeArabic(arabicized);
  for (const [re, sub] of COMMON_ALIAS_FOLDS) out = out.replace(re, sub);
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

/**
 * Token-set similarity: 0..1. Used for ranking candidate hits.
 * Symmetric (so swapping query/candidate yields the same score).
 */
export function tokenScore(query: string, candidate: string): number {
  const a = new Set(normalize(query).split(/\s+/).filter(Boolean));
  const b = new Set(normalize(candidate).split(/\s+/).filter(Boolean));
  if (a.size === 0 || b.size === 0) return 0;
  let matched = 0;
  for (const t of a) if (b.has(t)) matched += 1;
  // partial credit for prefix matches (so "ramses" matches "رمسيس")
  if (matched === 0) {
    for (const t of a) {
      for (const c of b) {
        if (t.length >= 3 && (c.startsWith(t) || t.startsWith(c))) {
          matched += 0.5;
          break;
        }
      }
    }
  }
  return Math.min(1, matched / Math.max(a.size, b.size));
}

/** Haversine distance in kilometres (used for `near` bias). */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
