// ---------------------------------------------------------------------------
// Decision-support helpers for passenger results: ranking, confidence, and
// ---------------------------------------------------------------------------

export type FreshnessCategory = "now" | "recent" | "stale";
export type ConfidenceLevel = "high" | "medium" | "low";

/** i18n keys (resolved by t() in the UI) for each freshness bucket. */
export const FRESHNESS_LABEL_KEY: Record<FreshnessCategory, string> = {
  now: "freshness.now",
  recent: "freshness.recent",
  stale: "freshness.stale",
};

export const CONFIDENCE_LABEL_KEY: Record<ConfidenceLevel, string> = {
  high: "confidence.high",
  medium: "confidence.medium",
  low: "confidence.low",
};

/** Buckets:
 *  - now    : updated within the last 10 minutes
 *  - recent : updated within the last 2 hours
 *  - stale  : older than 2 hours (or unknown timestamp)
 */
export function freshnessCategory(
  updatedAt: string | Date | null | undefined,
  now: number = Date.now()
): FreshnessCategory {
  if (!updatedAt) return "stale";
  const ts = typeof updatedAt === "string" ? new Date(updatedAt).getTime() : updatedAt.getTime();
  if (!Number.isFinite(ts)) return "stale";
  const ageMin = (now - ts) / 60_000;
  if (ageMin < 10) return "now";
  if (ageMin < 120) return "recent";
  return "stale";
}

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------
// Inputs we care about (all optional so callers from different data shapes
// can pass what they have):
//   - updatedAt        : drives freshness component
//   - status           : "active" | "paused" | "ended" | unknown
//   - operatorConfirmed: true if a station operator has touched the line
//                        recently (we approximate by: status === "active"
//                        AND freshness !== "stale")
//   - stopsCount       : number of route stops attached to the line
//   - hasPickupArea    : whether pickupArea text exists
// ---------------------------------------------------------------------------
export type ConfidenceInput = {
  updatedAt?: string | Date | null;
  status?: string | null;
  stopsCount?: number;
  hasPickupArea?: boolean;
};

/**
 * Confidence formula (0..100):
 *   freshness   : now=40, recent=25, stale=5
 *   status      : active=25, paused=10, ended/other=0
 *   completeness: stops>=4 → 25, stops==3 → 18, stops==2 → 10, else 0
 *   pickupArea  : present → 10
 * Buckets: high ≥ 70, medium ≥ 45, low otherwise.
 */
export function computeConfidence(input: ConfidenceInput, now: number = Date.now()): {
  level: ConfidenceLevel;
  score: number;
} {
  const fresh = freshnessCategory(input.updatedAt ?? null, now);
  const freshPts = fresh === "now" ? 40 : fresh === "recent" ? 25 : 5;

  const status = (input.status ?? "active").toLowerCase();
  const statusPts = status === "active" ? 25 : status === "paused" ? 10 : 0;

  const stops = input.stopsCount ?? 0;
  const stopsPts = stops >= 4 ? 25 : stops === 3 ? 18 : stops === 2 ? 10 : 0;

  const pickupPts = input.hasPickupArea ? 10 : 0;

  const score = freshPts + statusPts + stopsPts + pickupPts;
  const level: ConfidenceLevel = score >= 70 ? "high" : score >= 45 ? "medium" : "low";
  return { level, score };
}

// ---------------------------------------------------------------------------
// Operator-confirmed status
// ---------------------------------------------------------------------------
// A line counts as "operator-confirmed" when an active operator touched it
// recently. We approximate that with: status === "active" AND freshness is
// "now" or "recent". This is HONEST — no fake realtime, no inferred presence.
// ---------------------------------------------------------------------------
export function isOperatorConfirmed(input: {
  status?: string | null;
  updatedAt?: string | Date | null;
}, now: number = Date.now()): boolean {
  const status = (input.status ?? "active").toLowerCase();
  if (status !== "active") return false;
  const fresh = freshnessCategory(input.updatedAt ?? null, now);
  return fresh === "now" || fresh === "recent";
}

// ---------------------------------------------------------------------------
// Explanations — structured reason codes (i18n keys resolved by UI)
// ---------------------------------------------------------------------------
// Each reason has:
//   - key  : i18n key for the human sentence
//   - tone : "positive" | "neutral" | "negative" — drives badge color
//   - vars : optional interpolation values
// The UI renders them as a short bullet list inside the result card details.
// ---------------------------------------------------------------------------
export type ReasonTone = "positive" | "neutral" | "negative";
export type Reason = {
  key: string;
  tone: ReasonTone;
  vars?: Record<string, string | number>;
};

export type ExplainInput = {
  isDirect: boolean;
  walkToPickupKm: number;
  walkFromDropoffKm: number;
  cars: number;
  status?: string | null;
  updatedAt?: string | Date | null;
  confidence: ConfidenceLevel;
  isTopPick?: boolean;
  isOperatorConfirmed?: boolean;
};

/** Generates "why this result" reasons (recommendation rationale). */
export function explainResult(r: ExplainInput): Reason[] {
  const out: Reason[] = [];
  if (r.isTopPick) out.push({ key: "explain.topPick", tone: "positive" });
  if (r.isDirect) out.push({ key: "explain.direct", tone: "positive" });
  else out.push({
    key: "explain.nearDropoff",
    tone: "neutral",
    vars: { km: r.walkFromDropoffKm.toFixed(1) },
  });
  if (r.walkToPickupKm <= 0.4) out.push({ key: "explain.shortWalk", tone: "positive" });
  else if (r.walkToPickupKm >= 1.5) out.push({
    key: "explain.longWalk",
    tone: "negative",
    vars: { km: r.walkToPickupKm.toFixed(1) },
  });
  if (r.cars >= 3) out.push({ key: "explain.manyCars", tone: "positive", vars: { n: r.cars } });
  else if (r.cars === 0) out.push({ key: "explain.zeroCars", tone: "negative" });
  else out.push({ key: "explain.someCars", tone: "neutral", vars: { n: r.cars } });
  if (r.isOperatorConfirmed) out.push({ key: "explain.operatorConfirmed", tone: "positive" });
  return out;
}

/** Generates "why confidence is X" reasons. */
export function explainConfidence(input: ConfidenceInput, now: number = Date.now()): Reason[] {
  const out: Reason[] = [];
  const fresh = freshnessCategory(input.updatedAt ?? null, now);
  if (fresh === "now") out.push({ key: "explainConf.freshNow", tone: "positive" });
  else if (fresh === "recent") out.push({ key: "explainConf.freshRecent", tone: "neutral" });
  else out.push({ key: "explainConf.freshStale", tone: "negative" });

  const status = (input.status ?? "active").toLowerCase();
  if (status === "active") out.push({ key: "explainConf.statusActive", tone: "positive" });
  else if (status === "paused") out.push({ key: "explainConf.statusPaused", tone: "negative" });
  else out.push({ key: "explainConf.statusOther", tone: "negative" });

  const stops = input.stopsCount ?? 0;
  if (stops >= 4) out.push({ key: "explainConf.stopsRich", tone: "positive", vars: { n: stops } });
  else if (stops >= 2) out.push({ key: "explainConf.stopsThin", tone: "neutral", vars: { n: stops } });
  else out.push({ key: "explainConf.stopsMissing", tone: "negative" });

  if (input.hasPickupArea) out.push({ key: "explainConf.pickupKnown", tone: "positive" });
  else out.push({ key: "explainConf.pickupUnknown", tone: "neutral" });

  return out;
}

// ---------------------------------------------------------------------------
// Result ranking
// ---------------------------------------------------------------------------
// The planner already produces candidate trips. We score them so the top
// 1-2 best options bubble up. Higher score = better. We DO NOT remove any
// existing labels or candidates — only resort and add a "bestNow" hint.
// ---------------------------------------------------------------------------
export type RankInput = {
  isDirect: boolean;
  walkToPickupKm: number;
  walkFromDropoffKm: number;
  cars: number;
  status?: string | null;
  updatedAt?: string | Date | null;
  /** Optional mode bonus from `modeRankBoost` — additive, default 0. */
  modeBoost?: number;
};

/**
 * Score (higher is better):
 *   directness        : direct → +30
 *   walk to pickup    : −10 per km (capped at −30)
 *   walk from dropoff : −12 per km (capped at −30)
 *   cars available    : +min(cars*4, 20); 0 cars → −15
 *   status            : active +10, paused 0, other −20
 *   freshness         : now +10, recent +5, stale −10
 *   mode (optional)   : +modeBoost (e.g. bus=+6, community=−3)
 */
export function scoreResult(r: RankInput, now: number = Date.now()): number {
  let s = 0;
  if (r.isDirect) s += 30;
  s -= Math.min(r.walkToPickupKm * 10, 30);
  s -= Math.min(r.walkFromDropoffKm * 12, 30);
  if (r.cars > 0) s += Math.min(r.cars * 4, 20);
  else s -= 15;
  const status = (r.status ?? "active").toLowerCase();
  s += status === "active" ? 10 : status === "paused" ? 0 : -20;
  const fresh = freshnessCategory(r.updatedAt ?? null, now);
  s += fresh === "now" ? 10 : fresh === "recent" ? 5 : -10;
  s += r.modeBoost ?? 0;
  return s;
}
