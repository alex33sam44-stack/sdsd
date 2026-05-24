/**
 * Single source of truth for whether the community / marketing feature
 * surface (alerts, channels, chat, leaderboard, group trips, public
 * profiles, …) is exposed to end users.
 *
 * Why this exists:
 *   The community features under `src/marketing/**` historically read and
 *   wrote through `dataClient` (see `integrations/data/client.ts`), which
 *   is a Supabase-shaped *local-storage* stub. That created a hidden
 *   parallel data source: the rest of the app talks to the real NestJS
 *   backend at `VITE_API_BASE_URL`, but anything posted via `dataClient`
 *   never leaves the user's browser.
 *
 *   Until the backend grows the matching tables (see
 *   `docs/COMMUNITY_FEATURES_MIGRATION.md`), shipping these features to
 *   production would silently lie to users about persistence and would
 *   leave them un-moderated. The default is therefore:
 *
 *     - `dev` builds                       -> enabled (with a banner)
 *     - `prod` builds without opt-in       -> disabled at the route level
 *     - `prod` builds with explicit opt-in -> enabled (with a banner)
 *
 *   The opt-in flag is `VITE_COMMUNITY_FEATURES_ENABLED=true`; setting it
 *   should be a deliberate decision documented in the deploy playbook.
 */

type ViteEnv = {
  DEV?: boolean;
  PROD?: boolean;
  MODE?: string;
  VITE_COMMUNITY_FEATURES_ENABLED?: string;
};

function viteEnv(): ViteEnv {
  try {
    return ((import.meta as unknown as { env?: ViteEnv })?.env ?? {}) as ViteEnv;
  } catch {
    return {};
  }
}

function readFlag(): "true" | "false" | "auto" {
  const raw = viteEnv().VITE_COMMUNITY_FEATURES_ENABLED;
  if (typeof raw !== "string") return "auto";
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes" || v === "on") return "true";
  if (v === "false" || v === "0" || v === "no" || v === "off") return "false";
  return "auto";
}

/**
 * Returns `true` when the community routes should render. Returns `false`
 * when the gate component should redirect to the "coming soon" notice.
 */
export function isCommunityEnabled(): boolean {
  const flag = readFlag();
  if (flag === "true") return true;
  if (flag === "false") return false;
  // "auto": enabled only outside production. Dev/preview builds keep the UI
  // discoverable; prod builds default to off so users don't see fake data.
  return Boolean(viteEnv().DEV);
}

/**
 * Where do community reads/writes go right now?
 *
 *   - "local"   : the `dataClient` localStorage stub (current default).
 *   - "backend" : the NestJS REST API (planned; see migration doc).
 *
 * Even when "backend" is wired up later, callers that read from
 * `dataClient` will keep working without changes — `dataClient` itself
 * will switch over once the migration lands.
 */
export function communityDataLayer(): "local" | "backend" {
  // Reserved for future use. As of today there is no backend implementation,
  // so we always report "local". The shape lets the banner copy and
  // moderation surfaces evolve without changing every consumer.
  return "local";
}

/**
 * Convenience: should the in-page banner be rendered? True whenever the
 * data layer is local-only AND the feature is enabled (so the user sees it).
 */
export function shouldShowLocalDataNotice(): boolean {
  return isCommunityEnabled() && communityDataLayer() === "local";
}
