/**
 * Environment-specific configuration. Single place to read build-time flags
 * and feature toggles. Never read `import.meta.env` directly elsewhere.
 *
 * Vite injects:
 *   - DEV         : true for `vite dev`, false for `vite build`
 *   - PROD        : opposite of DEV
 *   - MODE        : "development" | "production" | custom
 *   - VITE_*      : explicit, build-time-injected variables
 */

import { getDataMode, isProdMode } from "./dataMode";

type ViteEnv = {
  DEV?: boolean;
  PROD?: boolean;
  MODE?: string;
  /** Self-hosted backend base URL, e.g. "https://api.yourdomain.com/api". */
  VITE_API_BASE_URL?: string;
  VITE_DATA_MODE?: string;
  VITE_APP_VERSION?: string;
  VITE_RELEASE_NAME?: string;
  VITE_SENTRY_DSN?: string;
};

function viteEnv(): ViteEnv {
  try {
    return ((import.meta as any)?.env ?? {}) as ViteEnv;
  } catch {
    return {};
  }
}

export const ENV = {
  /** Vite mode string, e.g. "development" | "production". */
  mode: viteEnv().MODE ?? "production",
  /** App release name, surfaced in logs. Defaults to mode + short timestamp. */
  release:
    viteEnv().VITE_RELEASE_NAME ??
    viteEnv().VITE_APP_VERSION ??
    `${viteEnv().MODE ?? "prod"}@${new Date().toISOString().slice(0, 10)}`,
  /** Optional remote error-sink DSN (Sentry-compatible). Empty = local logger only. */
  sentryDsn: viteEnv().VITE_SENTRY_DSN ?? "",
  /** Resolved dev/prod data mode (from src/lib/dataMode.ts). */
  dataMode: getDataMode(),
  /** True in production data mode, regardless of build mode. */
  isProd: isProdMode(),
  /** Self-hosted backend base URL, or empty string when not yet configured. */
  apiBaseUrl: (viteEnv().VITE_API_BASE_URL ?? "").replace(/\/$/, ""),
  /** True once the operator has pointed the app at the NestJS backend. */
  hasBackendConfig: Boolean(viteEnv().VITE_API_BASE_URL),
} as const;

/** Throws (in dev) or warns (in prod) if a required runtime config is absent.
 *  Called once on app boot — see `src/main.tsx`. */
export function assertRuntimeConfig(): void {
  const issues: string[] = [];
  if (!ENV.hasBackendConfig) {
    issues.push(
      "VITE_API_BASE_URL is missing. The app cannot reach the backend.",
    );
  }
  if (!issues.length) return;

  const msg = `[config] ${issues.join(" ")}`;
  if (ENV.isProd) {
    console.error(msg);
  } else {
    console.warn(msg);
  }
}
