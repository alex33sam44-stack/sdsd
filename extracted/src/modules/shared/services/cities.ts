export type Region = "mena_north_africa" | "mena_levant" | "mena_gulf" | "mena_horn_africa" | string;

export type City = {
  id: string;
  slug: string;
  name: string;
  /** Latin/English transliteration of the city name (optional). */
  name_en: string | null;
  country_code: string | null;
  /** Localized country name (Arabic by default in the seed). */
  country_name: string | null;
  /** English country name for international display. */
  country_name_en: string | null;
  /** Region grouping for international scaling (e.g. mena_gulf). */
  region: Region | null;
  lat: number | null;
  lng: number | null;
};

const CITY_SEED: City[] = [
  { id: "eg-cairo", slug: "cairo", name: "القاهرة", name_en: "Cairo", country_code: "EG", country_name: "مصر", country_name_en: "Egypt", region: "mena_north_africa", lat: 30.0444, lng: 31.2357 },
  { id: "sa-riyadh", slug: "riyadh", name: "الرياض", name_en: "Riyadh", country_code: "SA", country_name: "السعودية", country_name_en: "Saudi Arabia", region: "mena_gulf", lat: 24.7136, lng: 46.6753 },
  { id: "ae-abu-dhabi", slug: "abu-dhabi", name: "أبوظبي", name_en: "Abu Dhabi", country_code: "AE", country_name: "الإمارات", country_name_en: "United Arab Emirates", region: "mena_gulf", lat: 24.4539, lng: 54.3773 },
  { id: "qa-doha", slug: "doha", name: "الدوحة", name_en: "Doha", country_code: "QA", country_name: "قطر", country_name_en: "Qatar", region: "mena_gulf", lat: 25.2854, lng: 51.5310 },
  { id: "kw-kuwait-city", slug: "kuwait-city", name: "مدينة الكويت", name_en: "Kuwait City", country_code: "KW", country_name: "الكويت", country_name_en: "Kuwait", region: "mena_gulf", lat: 29.3759, lng: 47.9774 },
  { id: "bh-manama", slug: "manama", name: "المنامة", name_en: "Manama", country_code: "BH", country_name: "البحرين", country_name_en: "Bahrain", region: "mena_gulf", lat: 26.2235, lng: 50.5876 },
  { id: "om-muscat", slug: "muscat", name: "مسقط", name_en: "Muscat", country_code: "OM", country_name: "عُمان", country_name_en: "Oman", region: "mena_gulf", lat: 23.5880, lng: 58.3829 },
  { id: "ye-sanaa", slug: "sanaa", name: "صنعاء", name_en: "Sanaa", country_code: "YE", country_name: "اليمن", country_name_en: "Yemen", region: "mena_gulf", lat: 15.3694, lng: 44.1910 },
  { id: "jo-amman", slug: "amman", name: "عمّان", name_en: "Amman", country_code: "JO", country_name: "الأردن", country_name_en: "Jordan", region: "mena_levant", lat: 31.9454, lng: 35.9284 },
  { id: "lb-beirut", slug: "beirut", name: "بيروت", name_en: "Beirut", country_code: "LB", country_name: "لبنان", country_name_en: "Lebanon", region: "mena_levant", lat: 33.8938, lng: 35.5018 },
  { id: "sy-damascus", slug: "damascus", name: "دمشق", name_en: "Damascus", country_code: "SY", country_name: "سوريا", country_name_en: "Syria", region: "mena_levant", lat: 33.5138, lng: 36.2765 },
  { id: "iq-baghdad", slug: "baghdad", name: "بغداد", name_en: "Baghdad", country_code: "IQ", country_name: "العراق", country_name_en: "Iraq", region: "mena_levant", lat: 33.3152, lng: 44.3661 },
  { id: "ps-jerusalem", slug: "jerusalem", name: "القدس", name_en: "Jerusalem", country_code: "PS", country_name: "فلسطين", country_name_en: "Palestine", region: "mena_levant", lat: 31.7683, lng: 35.2137 },
  { id: "dz-algiers", slug: "algiers", name: "الجزائر", name_en: "Algiers", country_code: "DZ", country_name: "الجزائر", country_name_en: "Algeria", region: "mena_north_africa", lat: 36.7538, lng: 3.0588 },
  { id: "ma-rabat", slug: "rabat", name: "الرباط", name_en: "Rabat", country_code: "MA", country_name: "المغرب", country_name_en: "Morocco", region: "mena_north_africa", lat: 34.0209, lng: -6.8416 },
  { id: "tn-tunis", slug: "tunis", name: "تونس", name_en: "Tunis", country_code: "TN", country_name: "تونس", country_name_en: "Tunisia", region: "mena_north_africa", lat: 36.8065, lng: 10.1815 },
  { id: "ly-tripoli", slug: "tripoli", name: "طرابلس", name_en: "Tripoli", country_code: "LY", country_name: "ليبيا", country_name_en: "Libya", region: "mena_north_africa", lat: 32.8872, lng: 13.1913 },
  { id: "sd-khartoum", slug: "khartoum", name: "الخرطوم", name_en: "Khartoum", country_code: "SD", country_name: "السودان", country_name_en: "Sudan", region: "mena_north_africa", lat: 15.5007, lng: 32.5599 },
  { id: "mr-nouakchott", slug: "nouakchott", name: "نواكشوط", name_en: "Nouakchott", country_code: "MR", country_name: "موريتانيا", country_name_en: "Mauritania", region: "mena_north_africa", lat: 18.0735, lng: -15.9582 },
  { id: "so-mogadishu", slug: "mogadishu", name: "مقديشو", name_en: "Mogadishu", country_code: "SO", country_name: "الصومال", country_name_en: "Somalia", region: "mena_horn_africa", lat: 2.0469, lng: 45.3182 },
  { id: "dj-djibouti", slug: "djibouti", name: "جيبوتي", name_en: "Djibouti", country_code: "DJ", country_name: "جيبوتي", country_name_en: "Djibouti", region: "mena_horn_africa", lat: 11.5721, lng: 43.1456 },
  { id: "km-moroni", slug: "moroni", name: "موروني", name_en: "Moroni", country_code: "KM", country_name: "جزر القمر", country_name_en: "Comoros", region: "mena_horn_africa", lat: -11.7172, lng: 43.2473 },
];

const SUGGESTIONS_KEY = "taxi.localSuggestions";

type StationSuggestion = SuggestionInput & { type: "station"; submittedAt: string };
type LineSuggestion = LineSuggestionInput & { type: "line"; submittedAt: string };
type QueuedSuggestion = StationSuggestion | LineSuggestion;

function readQueuedSuggestions(): QueuedSuggestion[] {
  try {
    const raw = localStorage.getItem(SUGGESTIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedSuggestion[]) : [];
  } catch {
    return [];
  }
}

function writeQueuedSuggestions(items: QueuedSuggestion[]) {
  try {
    localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(items));
  } catch {
    /* ignore storage failures */
  }
}

export async function listCities(): Promise<City[]> {
  return CITY_SEED.slice().sort((a, b) => {
    const c = (a.country_name ?? "").localeCompare(b.country_name ?? "", "ar");
    if (c !== 0) return c;
    return a.name.localeCompare(b.name, "ar");
  });
}

/** Pick the best display name for the current UI language. */
export function localizedCityName(city: Pick<City, "name" | "name_en">, lang: string): string {
  if (lang.startsWith("ar")) return city.name;
  return city.name_en?.trim() || city.name;
}

/** Pick the best country name for the current UI language. */
export function localizedCountryName(
  city: Pick<City, "country_name" | "country_name_en">,
  lang: string,
): string {
  if (lang.startsWith("ar")) return city.country_name ?? "";
  return city.country_name_en?.trim() || city.country_name || "";
}

export type SuggestionInput = {
  city_name: string;
  country_code?: string | null;
  country_name?: string | null;
  station_name: string;
  area?: string | null;
  lat?: number | null;
  lng?: number | null;
  contact?: string | null;
  notes?: string | null;
};

export async function submitStationSuggestion(input: SuggestionInput) {
  const next = readQueuedSuggestions();
  next.unshift({ ...input, type: "station", submittedAt: new Date().toISOString() });
  writeQueuedSuggestions(next.slice(0, 100));
}

export type LineSuggestionInput = {
  line_name: string;
  from_point: string;
  to_point: string;
  city_name: string;
  country_code?: string | null;
  country_name?: string | null;
  contact?: string | null;
  notes?: string | null;
};

export async function submitLineSuggestion(input: LineSuggestionInput) {
  const next = readQueuedSuggestions();
  next.unshift({ ...input, type: "line", submittedAt: new Date().toISOString() });
  writeQueuedSuggestions(next.slice(0, 100));
}

/** Haversine distance in km */
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Find the closest seeded city to a given coordinate (used for auto-detect). */
export function findNearestCity(
  cities: City[],
  lat: number,
  lng: number,
): { city: City; distance: number } | null {
  let best: { city: City; distance: number } | null = null;
  for (const c of cities) {
    if (c.lat == null || c.lng == null) continue;
    const d = distanceKm({ lat, lng }, { lat: c.lat, lng: c.lng });
    if (!best || d < best.distance) best = { city: c, distance: d };
  }
  return best;
}

/**
 * Country-aware filter for stations.
 * - Stations carrying `country_code` are matched directly (authoritative).
 * - Stations with no country_code (legacy data) are matched by city-name substring,
 *   so existing behaviour is preserved while we backfill.
 */
export function filterStationsByCountry<S extends { country_code?: string | null; name: string; area?: string | null }>(
  stations: S[],
  countryCode: string,
  detectedCityName?: string | null,
): S[] {
  if (!countryCode) return stations;
  const cityNeedle = detectedCityName?.toLowerCase().trim();
  return stations.filter((s) => {
    if (s.country_code) return s.country_code === countryCode;
    if (!cityNeedle) return false;
    const blob = `${s.name} ${s.area ?? ""}`.toLowerCase();
    return blob.includes(cityNeedle);
  });
}

/** Group cities by region for menus / international navigation. */
export function groupCitiesByRegion(cities: City[]): Map<Region, City[]> {
  const out = new Map<Region, City[]>();
  for (const c of cities) {
    const key: Region = c.region ?? "other";
    const arr = out.get(key) ?? [];
    arr.push(c);
    out.set(key, arr);
  }
  return out;
}
