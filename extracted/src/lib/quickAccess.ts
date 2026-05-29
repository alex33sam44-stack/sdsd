// Local-first storage for passenger convenience features.
// - Saved frequent places (Home, Work, etc.)
// - Recent searches (free-text queries)
// - Recent destinations (resolved places used in the planner)
//
// We keep this in localStorage so it works for guest users too. It is
// table is left untouched (it is used elsewhere and requires auth).

export type SavedPlaceKind = "home" | "work" | "university" | "hospital" | "custom";

export type SavedPlace = {
  id: string;
  kind: SavedPlaceKind;
  label: string;
  lat: number;
  lng: number;
  area?: string;
  createdAt: string;
};

export type RecentDestination = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  area?: string;
  usedAt: string;
};

export type RecentSearch = {
  id: string;
  query: string;
  usedAt: string;
};

const KEY_PLACES = "taxi.savedPlaces";
const KEY_RECENT_DEST = "taxi.recentDestinations";
const KEY_RECENT_SEARCH = "taxi.recentSearches";

const MAX_RECENT_DEST = 6;
const MAX_RECENT_SEARCH = 8;

// ---------- helpers ----------
function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}
function write<T>(key: string, value: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota/private mode errors */
  }
}
function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ---------- saved places ----------
export function listSavedPlaces(): SavedPlace[] {
  return read<SavedPlace>(KEY_PLACES);
}

export function saveSavedPlace(input: Omit<SavedPlace, "id" | "createdAt"> & { id?: string }): SavedPlace {
  const list = listSavedPlaces();
  // For non-custom kinds, replace any existing of the same kind (only one Home, etc.)
  let next: SavedPlace[];
  const place: SavedPlace = {
    id: input.id ?? uid(),
    kind: input.kind,
    label: input.label,
    lat: input.lat,
    lng: input.lng,
    area: input.area,
    createdAt: new Date().toISOString(),
  };
  if (input.kind !== "custom") {
    next = [place, ...list.filter((p) => p.kind !== input.kind)];
  } else {
    next = [place, ...list.filter((p) => p.id !== place.id)];
  }
  write(KEY_PLACES, next);
  return place;
}

export function removeSavedPlace(id: string) {
  write(KEY_PLACES, listSavedPlaces().filter((p) => p.id !== id));
}

// ---------- recent destinations ----------
export function listRecentDestinations(): RecentDestination[] {
  return read<RecentDestination>(KEY_RECENT_DEST);
}

export function pushRecentDestination(input: { label: string; lat: number; lng: number; area?: string }) {
  if (!input.label) return;
  const list = listRecentDestinations();
  const dedupKey = (d: { lat: number; lng: number; label: string }) =>
    `${d.label}|${d.lat.toFixed(4)}|${d.lng.toFixed(4)}`;
  const filtered = list.filter((d) => dedupKey(d) !== dedupKey(input));
  const entry: RecentDestination = {
    id: uid(),
    label: input.label,
    lat: input.lat,
    lng: input.lng,
    area: input.area,
    usedAt: new Date().toISOString(),
  };
  write(KEY_RECENT_DEST, [entry, ...filtered].slice(0, MAX_RECENT_DEST));
}

export function clearRecentDestinations() {
  write(KEY_RECENT_DEST, []);
}

// ---------- recent searches ----------
export function listRecentSearches(): RecentSearch[] {
  return read<RecentSearch>(KEY_RECENT_SEARCH);
}

export function pushRecentSearch(query: string) {
  const q = query.trim();
  if (q.length < 2) return;
  const list = listRecentSearches();
  const filtered = list.filter((s) => s.query.toLowerCase() !== q.toLowerCase());
  const entry: RecentSearch = { id: uid(), query: q, usedAt: new Date().toISOString() };
  write(KEY_RECENT_SEARCH, [entry, ...filtered].slice(0, MAX_RECENT_SEARCH));
}

export function clearRecentSearches() {
  write(KEY_RECENT_SEARCH, []);
}

// ---------- URL helpers for quick re-plan ----------
export function placeToParams(label: string, lat: number, lng: number) {
  return `${lat.toFixed(6)},${lng.toFixed(6)},${encodeURIComponent(label)}`;
}

export function parsePlaceParam(value: string | null): { lat: number; lng: number; label: string } | null {
  if (!value) return null;
  const parts = value.split(",");
  if (parts.length < 3) return null;
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  const label = decodeURIComponent(parts.slice(2).join(","));
  return { lat, lng, label };
}
