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

// ============================================================
// Hub detection + confidence banding (additive helpers).
// ============================================================

/**
 * Coarse hub identifier for an entry's location, computed from
 * lat/lng + the canonical `area` label. Used by the local-search
 * service so a query like "Cairo University" can be ranked higher
 * within the Cairo hub than against a same-named Alexandria stop.
 */
export type LocalHub = 'cairo' | 'giza' | 'alexandria' | 'delta' | 'upper-egypt' | 'sinai' | 'red-sea' | '';

const HUB_BOXES: Array<{ hub: LocalHub; latMin: number; latMax: number; lngMin: number; lngMax: number }> = [
  { hub: 'giza',         latMin: 29.7, latMax: 30.2, lngMin: 30.5, lngMax: 31.20 },
  { hub: 'cairo',        latMin: 29.7, latMax: 30.2, lngMin: 31.20, lngMax: 31.6 },
  { hub: 'alexandria',   latMin: 31.0, latMax: 31.4, lngMin: 29.6, lngMax: 30.2 },
  { hub: 'delta',        latMin: 30.3, latMax: 31.6, lngMin: 30.5, lngMax: 32.7 },
  { hub: 'upper-egypt',  latMin: 22.0, latMax: 29.5, lngMin: 30.0, lngMax: 35.0 },
  { hub: 'sinai',        latMin: 27.5, latMax: 31.5, lngMin: 32.7, lngMax: 35.5 },
  { hub: 'red-sea',      latMin: 22.0, latMax: 28.5, lngMin: 33.0, lngMax: 36.0 },
];

const HUB_KEYWORDS: Array<{ hub: LocalHub; words: RegExp }> = [
  { hub: 'giza',       words: /(جيزه|الجيزه|gizeh|giza|haram|الهرم|pyramids|الدقي|dokki|المهندسين|mohandessin|6\s*october|اكتوبر)/i },
  { hub: 'cairo',      words: /(القاهره|القاهرة|cairo|kairo|تحرير|tahrir|رمسيس|ramses|المعادي|maadi|حلوان|helwan|nasr\s*city|مدينة\s*نصر|heliopolis|مصر\s*الجديده)/i },
  { hub: 'alexandria', words: /(الاسكندريه|الإسكندرية|alex(andria)?|sidi\s*gaber|سيدي\s*جابر|raml|المنشيه|mansheya)/i },
  { hub: 'delta',      words: /(طنطا|tanta|المنصوره|mansoura|الزقازيق|zagazig|بنها|banha|دمياط|damietta|دمنهور|damanhour)/i },
  { hub: 'upper-egypt', words: /(اسيوط|asyut|سوهاج|sohag|قنا|qena|الاقصر|luxor|اسوان|aswan|المنيا|minya|بني\s*سويف|beni\s*suef)/i },
  { hub: 'sinai',      words: /(شرم|sharm|طابا|taba|دهب|dahab|نويبع|nuweiba|العريش|arish)/i },
  { hub: 'red-sea',    words: /(الغردقه|الغردقة|hurghada|سفاجا|safaga|مرسى\s*علم|marsa\s*alam)/i },
];

/** Map a coordinate to a coarse hub, or '' when nothing matches. */
export function hubForCoord(lat: number | undefined, lng: number | undefined): LocalHub {
  if (typeof lat !== 'number' || typeof lng !== 'number') return '';
  for (const box of HUB_BOXES) {
    if (lat >= box.latMin && lat <= box.latMax && lng >= box.lngMin && lng <= box.lngMax) return box.hub;
  }
  return '';
}

/** Detect a hub from the raw query text (Arabic + English + franko). */
export function detectHubFromQuery(query: string | null | undefined): LocalHub {
  const text = (query ?? '').toString();
  if (!text) return '';
  for (const { hub, words } of HUB_KEYWORDS) if (words.test(text)) return hub;
  return '';
}

/** Map a `score` (0..1) to a friendly banding consumed by SPAs. */
export function confidenceBand(score: number): 'high' | 'medium' | 'low' {
  if (score >= 0.75) return 'high';
  if (score >= 0.45) return 'medium';
  return 'low';
}

/**
 * Edit-distance-aware suggestion picker. Given the (possibly empty)
 * candidate list and the query, return up to 5 alternate phrasings
 * the user could click. Used to power "did you mean …" UX.
 */
export function pickSuggestions(query: string, candidates: string[], limit = 5): string[] {
  const q = normalize(query);
  if (!q) return [];
  const ranked = candidates
    .map((c) => ({ c, d: editDistance(q, normalize(c)) }))
    .filter((x) => x.d <= Math.max(2, Math.ceil(q.length / 3)))
    .sort((a, b) => a.d - b.d);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of ranked) {
    if (seen.has(r.c)) continue;
    seen.add(r.c);
    out.push(r.c);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Damerau–Levenshtein distance, capped: we don't care about the
 * exact value beyond the user-visible threshold of "close enough".
 */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const al = a.length, bl = b.length;
  const grid: number[][] = Array.from({ length: al + 1 }, () => new Array(bl + 1).fill(0));
  for (let i = 0; i <= al; i += 1) grid[i][0] = i;
  for (let j = 0; j <= bl; j += 1) grid[0][j] = j;
  for (let i = 1; i <= al; i += 1) {
    for (let j = 1; j <= bl; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      grid[i][j] = Math.min(
        grid[i - 1][j] + 1,        // deletion
        grid[i][j - 1] + 1,        // insertion
        grid[i - 1][j - 1] + cost, // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        grid[i][j] = Math.min(grid[i][j], grid[i - 2][j - 2] + 1); // transposition
      }
    }
  }
  return grid[al][bl];
}
