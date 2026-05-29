/**
 * Data quality domain types.
 *
 * The platform's value depends on whether stations, lines, stops
 * and intercity routes are complete enough to plan a real trip.
 * This module produces a deterministic JSON snapshot of the catalog
 * health that admins can read live, that CI can gate releases on,
 * and that operators can re-run before every public launch.
 */

export type Severity = 'info' | 'warning' | 'critical';

export interface QualityCheck {
  id: string;
  /** Human-readable label, translated downstream by the i18n interceptor. */
  label: string;
  severity: Severity;
  /** Pass = check satisfied, fail = should be addressed. */
  status: 'pass' | 'fail';
  /** Number of offending rows (0 when pass). */
  count: number;
  /** Optional sample identifiers (≤5) — used by the dashboard drill-down. */
  sample?: string[];
}

export interface QualityCounts {
  cities: number;
  stations: number;
  publishedStations: number;
  lines: number;
  publishedLines: number;
  stops: number;
  intercityRoutes: number;
  intercitySchedules: number;
}

export interface QualityReport {
  generatedAt: string;
  tenantId: string | null;
  counts: QualityCounts;
  checks: QualityCheck[];
  /** Summary score 0..100, weighted by severity. */
  score: number;
  /** Coarse status: green ≥85, amber ≥60, red <60. */
  band: 'green' | 'amber' | 'red';
}
