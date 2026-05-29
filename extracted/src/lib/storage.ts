import { legacyOverridesEnabled } from "@/lib/dataMode";

// ---------------------------------------------------------------------------
// UI preference keys (kept in localStorage in BOTH dev and prod — they store
// per-device user preferences, not domain data).
// ---------------------------------------------------------------------------
const KEY_DEFAULT = "taxi.defaultStation";

// ---------------------------------------------------------------------------
// Legacy override key. Only honored in dev mode (see `dataMode.ts`). The
// planner reads this so a developer can tweak per-line car counts without a
// is used.
// ---------------------------------------------------------------------------
const KEY_OVERRIDES = "taxi.lineOverrides";

export function getDefaultStationId(): string | null {
  try { return localStorage.getItem(KEY_DEFAULT); } catch { return null; }
}
export function setDefaultStationId(id: string) {
  try { localStorage.setItem(KEY_DEFAULT, id); } catch {}
}
export function clearDefaultStationId() {
  try { localStorage.removeItem(KEY_DEFAULT); } catch {}
}

// ============ Dev-only car-count overrides for the local planner ============
export type LineOverride = { cars: number; updatedAt: string };
export type LineOverrides = Record<string, LineOverride>;

export function getLineOverrides(): LineOverrides {
  if (!legacyOverridesEnabled()) return {};
  try {
    const raw = localStorage.getItem(KEY_OVERRIDES);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

// ============ Display helpers ============

/** Locale-aware relative time. Uses Intl.RelativeTimeFormat under the hood. */
export function formatRelativeTime(iso: string, locale?: string): string {
  const lang =
    locale ||
    (typeof document !== "undefined" ? document.documentElement.lang : "") ||
    (typeof navigator !== "undefined" ? navigator.language : "en") ||
    "en";
  const diffMs = Date.now() - new Date(iso).getTime();
  const absMs = Math.abs(diffMs);
  const sign = diffMs >= 0 ? -1 : 1; // negative = past
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  const mins = Math.floor(absMs / 60_000);
  if (mins < 1) return rtf.format(0, "minute");
  if (mins < 60) return rtf.format(sign * mins, "minute");
  const hours = Math.floor(mins / 60);
  if (hours < 24) return rtf.format(sign * hours, "hour");
  const days = Math.floor(hours / 24);
  return rtf.format(sign * days, "day");
}

/** @deprecated kept for backward compat — use formatRelativeTime. */
export const formatRelativeArabic = (iso: string) => formatRelativeTime(iso, "ar");

const AR_DIGITS = ["٠","١","٢","٣","٤","٥","٦","٧","٨","٩"];

/** Convert digits in a string/number to Arabic-Indic digits (only useful for ar locale). */
export function toArabicDigits(n: number | string): string {
  return String(n).replace(/\d/g, (d) => AR_DIGITS[+d]);
}

/** Locale-aware number formatter. Uses Arabic digits for `ar`, Western digits otherwise. */
export function formatNumber(n: number | string, locale?: string): string {
  const lang =
    locale ||
    (typeof document !== "undefined" ? document.documentElement.lang : "") ||
    "en";
  return lang.startsWith("ar") ? toArabicDigits(n) : String(n);
}

