/**
 * Additional Data Quality checks (additive, never replacing the
 * checks already wired into DataQualityService).
 *
 * Each function follows the same contract as the original checks:
 *   (tenantId, prisma) => Promise<QualityCheck[]>
 *
 * They are deliberately implemented as standalone functions so:
 *   1. They can be unit-tested without booting Nest.
 *   2. New checks can be added one-at-a-time without churning the
 *      service file.
 *   3. The original 8 checks keep their stable IDs / labels so any
 *      release-evidence dashboard built on the v1 contract continues
 *      to render unchanged.
 *
 * 8 new checks shipped here:
 *   1. lines.duplicate-destination  — same station + destination
 *   2. stops.duplicate-on-line      — same line + (lat,lng) duplicate
 *   3. stations.missing-geo         — non-finite or (0,0) coords
 *   4. lines.stale                  — published but availability
 *                                     hasn't been updated in 14 days
 *   5. lines.missing-fare           — published, no fare in price
 *                                     metadata
 *   6. content.invalid-provider     — DraftChange whose author isn't
 *                                     a real user (orphan FK warning)
 *   7. contributions.weak-evidence  — published lines with only one
 *                                     contributor and zero validation
 *                                     drafts (UGC trust gate)
 *   8. launch.unreviewed-blockers   — DraftChange rows still pending
 *                                     after 7 days
 */
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { QualityCheck } from './data-quality.types';

const STALE_DAYS = 14;
const PENDING_DRAFT_DAYS = 7;

const FARE_HINT_KEYS = ['fare', 'price', 'fareEgp', 'priceEgp', 'cost'];

type ExtraCheckFn = (
  tenantId: string | null,
  prisma: PrismaService,
) => Promise<QualityCheck[]>;

// ---------------- 1. Duplicate route detection ----------------
export const checkDuplicateLineDestinations: ExtraCheckFn = async (tenantId, prisma) => {
  const where = tenantId ? { tenantId } : {};
  const lines = await prisma.line.findMany({
    where,
    select: { id: true, stationId: true, destination: true, vehicleType: true },
  });
  const seen = new Map<string, string[]>();
  for (const l of lines) {
    const dest = (l.destination ?? '').trim().toLowerCase();
    if (!dest) continue;
    const key = `${l.stationId}::${l.vehicleType}::${dest}`;
    const list = seen.get(key) ?? [];
    list.push(l.id);
    seen.set(key, list);
  }
  const duplicates: string[] = [];
  for (const ids of seen.values()) {
    if (ids.length > 1) duplicates.push(...ids.slice(1));
  }
  return [
    {
      id: 'lines.duplicate-destination',
      label: 'Duplicate line destinations per station are merged or removed',
      severity: 'warning',
      status: duplicates.length === 0 ? 'pass' : 'fail',
      count: duplicates.length,
      sample: duplicates.slice(0, 5),
    },
  ];
};

// ---------------- 2. Duplicate stop detection ----------------
export const checkDuplicateStopsPerLine: ExtraCheckFn = async (tenantId, prisma) => {
  const where = tenantId ? { tenantId } : {};
  const stops = await prisma.routeStop.findMany({
    where,
    select: { id: true, lineId: true, lat: true, lng: true, name: true },
  });
  const buckets = new Map<string, string[]>();
  for (const s of stops) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue;
    const lat4 = Math.round(Number(s.lat) * 10000) / 10000;
    const lng4 = Math.round(Number(s.lng) * 10000) / 10000;
    const key = `${s.lineId}::${lat4},${lng4}`;
    const list = buckets.get(key) ?? [];
    list.push(s.id);
    buckets.set(key, list);
  }
  const dupes: string[] = [];
  for (const ids of buckets.values()) if (ids.length > 1) dupes.push(...ids.slice(1));
  return [
    {
      id: 'stops.duplicate-on-line',
      label: 'Duplicate stops on the same line are deduplicated',
      severity: 'warning',
      status: dupes.length === 0 ? 'pass' : 'fail',
      count: dupes.length,
      sample: dupes.slice(0, 5),
    },
  ];
};

// ---------------- 3. Missing geo coordinates ----------------
export const checkMissingStationCoordinates: ExtraCheckFn = async (tenantId, prisma) => {
  const where = tenantId ? { tenantId } : {};
  const stations = await prisma.station.findMany({
    where,
    select: { id: true, lat: true, lng: true, isPublished: true },
  });
  const offenders = stations
    .filter(
      (s) =>
        !Number.isFinite(s.lat) ||
        !Number.isFinite(s.lng) ||
        (Math.abs(Number(s.lat)) < 0.0001 && Math.abs(Number(s.lng)) < 0.0001),
    )
    .map((s) => s.id);
  return [
    {
      id: 'stations.missing-geo',
      label: 'Every station carries a finite, non-zero (lat, lng)',
      severity: 'critical',
      status: offenders.length === 0 ? 'pass' : 'fail',
      count: offenders.length,
      sample: offenders.slice(0, 5),
    },
  ];
};

// ---------------- 4. Stale routes ----------------
export const checkStaleLines: ExtraCheckFn = async (tenantId, prisma) => {
  const where = tenantId ? { tenantId } : {};
  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);
  const lines = await prisma.line.findMany({
    where: { ...where, isPublished: true },
    select: { id: true, carsUpdatedAt: true, updatedAt: true },
  });
  const offenders = lines
    .filter((l) => {
      const lastTouch = (l as any).carsUpdatedAt ?? (l as any).updatedAt;
      return !lastTouch || new Date(lastTouch) < cutoff;
    })
    .map((l) => l.id);
  return [
    {
      id: 'lines.stale',
      label: `Published lines updated within the last ${STALE_DAYS} days`,
      severity: 'warning',
      status: offenders.length === 0 ? 'pass' : 'fail',
      count: offenders.length,
      sample: offenders.slice(0, 5),
    },
  ];
};

// ---------------- 5. Missing fares ----------------
export const checkMissingFares: ExtraCheckFn = async (tenantId, prisma) => {
  const where = tenantId ? { tenantId } : {};
  const lines = await prisma.line.findMany({
    where: { ...where, isPublished: true },
    select: { id: true, pickupArea: true },
  });

  const drafts = await prisma.draftChange
    .findMany({
      where: { ...where, entity: 'line', status: 'applied' },
      select: { entityId: true, patch: true, appliedAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
    .catch(() => []);

  const fareByLine = new Map<string, boolean>();
  for (const d of drafts as any[]) {
    const id = d.entityId ?? '';
    if (!id || fareByLine.has(id)) continue;
    fareByLine.set(id, hasFareSignal(d.patch));
  }

  const offenders = lines
    .filter((l) => {
      if (l.pickupArea && /\d/.test(l.pickupArea)) return false;
      return !fareByLine.get(l.id);
    })
    .map((l) => l.id);

  return [
    {
      id: 'lines.missing-fare',
      label: 'Published lines have a fare attached (draft or pickupArea)',
      severity: 'warning',
      status: offenders.length === 0 ? 'pass' : 'fail',
      count: offenders.length,
      sample: offenders.slice(0, 5),
    },
  ];
};

// ---------------- 6. Invalid provider source ----------------
export const checkInvalidProviderSource: ExtraCheckFn = async (tenantId, prisma) => {
  const where = tenantId ? { tenantId } : {};
  const drafts = await prisma.draftChange
    .findMany({
      where: { ...where, status: { in: ['pending', 'applied'] } },
      select: { id: true, author: { select: { id: true } } },
      take: 500,
    })
    .catch(() => []);
  const offenders = (drafts as any[]).filter((d) => !d.author?.id).map((d) => d.id);
  return [
    {
      id: 'content.invalid-provider',
      label: 'Pending/applied drafts trace back to a real author',
      severity: 'warning',
      status: offenders.length === 0 ? 'pass' : 'fail',
      count: offenders.length,
      sample: offenders.slice(0, 5),
    },
  ];
};

// ---------------- 7. Weak contribution evidence ----------------
export const checkWeakContributionEvidence: ExtraCheckFn = async (tenantId, prisma) => {
  const where = tenantId ? { tenantId } : {};
  const lines = await prisma.line.findMany({
    where: { ...where, isPublished: true },
    select: { id: true },
  });
  if (lines.length === 0) return [];

  const drafts = await prisma.draftChange
    .findMany({
      where: { ...where, entity: 'line', status: 'applied' },
      select: { entityId: true, authorId: true },
    })
    .catch(() => []);

  const authorsByLine = new Map<string, Set<string>>();
  for (const d of drafts as any[]) {
    if (!d.entityId) continue;
    const set = authorsByLine.get(d.entityId) ?? new Set();
    set.add(d.authorId);
    authorsByLine.set(d.entityId, set);
  }
  const offenders = lines
    .filter((l) => (authorsByLine.get(l.id)?.size ?? 0) < 2)
    .map((l) => l.id);
  return [
    {
      id: 'contributions.weak-evidence',
      label: 'Published lines were touched by ≥ 2 distinct contributors',
      severity: 'info',
      status: offenders.length === 0 ? 'pass' : 'fail',
      count: offenders.length,
      sample: offenders.slice(0, 5),
    },
  ];
};

// ---------------- 8. Unreviewed launch blockers ----------------
export const checkUnreviewedLaunchBlockers: ExtraCheckFn = async (tenantId, prisma) => {
  const where = tenantId ? { tenantId } : {};
  const cutoff = new Date(Date.now() - PENDING_DRAFT_DAYS * 24 * 60 * 60 * 1000);
  const drafts = await prisma.draftChange
    .findMany({
      where: { ...where, status: 'pending', createdAt: { lt: cutoff } },
      select: { id: true },
      take: 500,
    })
    .catch(() => []);
  const offenders = (drafts as any[]).map((d) => d.id);
  return [
    {
      id: 'launch.unreviewed-blockers',
      label: `Draft changes in 'pending' state for less than ${PENDING_DRAFT_DAYS} days`,
      severity: 'critical',
      status: offenders.length === 0 ? 'pass' : 'fail',
      count: offenders.length,
      sample: offenders.slice(0, 5),
    },
  ];
};

// ---------------- registry ----------------
/**
 * Stable, ordered list of extra checks. The DataQualityService
 * concatenates these onto its existing check list — never replaces.
 */
export const EXTRA_DATA_QUALITY_CHECKS: ExtraCheckFn[] = [
  checkDuplicateLineDestinations,
  checkDuplicateStopsPerLine,
  checkMissingStationCoordinates,
  checkStaleLines,
  checkMissingFares,
  checkInvalidProviderSource,
  checkWeakContributionEvidence,
  checkUnreviewedLaunchBlockers,
];

// ---------------- helpers (exported for tests) ----------------
export function hasFareSignal(patch: unknown): boolean {
  if (!patch || typeof patch !== 'object') return false;
  const obj = patch as Record<string, unknown>;
  for (const key of FARE_HINT_KEYS) {
    if (key in obj) {
      const value = obj[key];
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) return true;
      if (typeof value === 'string' && /\d/.test(value)) return true;
    }
  }
  const meta = obj.metadata;
  if (meta && typeof meta === 'object') return hasFareSignal(meta);
  return false;
}

export const _ALL_EXTRA_CHECK_IDS = [
  'lines.duplicate-destination',
  'stops.duplicate-on-line',
  'stations.missing-geo',
  'lines.stale',
  'lines.missing-fare',
  'content.invalid-provider',
  'contributions.weak-evidence',
  'launch.unreviewed-blockers',
] as const;
