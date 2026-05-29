export type InstallValueMomentReason = "route_calculated" | "route_shared";

const VALUE_MOMENT_EVENT = "mwasalat:pwa-value-moment";
const VALUE_MOMENTS_KEY = "mwasalat_install_value_moments";

export type InstallValueMomentDetail = {
  reason: InstallValueMomentReason;
  properties?: Record<string, unknown>;
};

export function markInstallValueMoment(
  reason: InstallValueMomentReason,
  properties: Record<string, unknown> = {},
): void {
  if (typeof window === "undefined") return;
  const detail: InstallValueMomentDetail = { reason, properties };
  try {
    const existing = JSON.parse(localStorage.getItem(VALUE_MOMENTS_KEY) || "[]") as InstallValueMomentDetail[];
    existing.push(detail);
    localStorage.setItem(VALUE_MOMENTS_KEY, JSON.stringify(existing.slice(-10)));
  } catch {
    // The prompt is a nice-to-have growth layer; never block the route result.
  }
  window.dispatchEvent(new CustomEvent<InstallValueMomentDetail>(VALUE_MOMENT_EVENT, { detail }));
}

export function getRecentInstallValueMoment(): InstallValueMomentDetail | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = JSON.parse(localStorage.getItem(VALUE_MOMENTS_KEY) || "[]") as InstallValueMomentDetail[];
    return existing.at(-1) ?? null;
  } catch {
    return null;
  }
}

export const INSTALL_VALUE_MOMENT_EVENT = VALUE_MOMENT_EVENT;
