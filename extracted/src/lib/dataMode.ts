/**
 * Single source of truth for dev/prod mode.
 *
 * The self-hosted platform now has a single data path:
 *   frontend -> REST API -> self-hosted backend -> MySQL
 *
 * Development mode may still change logging verbosity, but it must NOT
 * silently switch the app back to seed data or legacy local overrides.
 */

type DataMode = "dev" | "prod";

function readModeFromEnv(): DataMode | null {
  try {
    const v = (import.meta as any)?.env?.VITE_DATA_MODE;
    if (v === "dev" || v === "prod") return v;
  } catch {}
  return null;
}

const FORCED = readModeFromEnv();

export function getDataMode(): DataMode {
  if (FORCED) return FORCED;
  const isDev = Boolean((import.meta as any)?.env?.DEV);
  return isDev ? "dev" : "prod";
}

export function isDevMode(): boolean {
  return getDataMode() === "dev";
}

export function isProdMode(): boolean {
  return getDataMode() === "prod";
}

export function legacyOverridesEnabled(): boolean {
  return false;
}

/** Seed fallback is disabled in both dev and prod to avoid any dual data path. */
export function seedFallbackEnabled(): boolean {
  return false;
}
