import { BillingPlanSeed } from './default-plans';

export const BILLING_FEATURE_CATALOG = [
  { key: 'analytics', label: 'Analytics', description: 'Operational analytics and demand reports.' },
  { key: 'suggestions', label: 'Suggestions', description: 'Automatic operational suggestions for supervisors.' },
  { key: 'interoperability', label: 'Interoperability', description: 'GTFS-like/open-data export and interoperability tools.' },
  { key: 'importExport', label: 'Import / Export', description: 'Snapshot export/import and migration tooling.' },
  { key: 'liveOps', label: 'Live operations', description: 'Live operations dashboard and operator insights.' },
  { key: 'validation', label: 'Validation', description: 'Data validation center and readiness checks.' },
  { key: 'drafts', label: 'Draft workflow', description: 'Draft / review / publish workflow for edits.' },
  { key: 'teamManagement', label: 'Team management', description: 'Tenant team management, invites, and role assignment.' },
  { key: 'customDomain', label: 'Custom domain', description: 'Use a tenant-owned custom domain.' },
  { key: 'whiteLabel', label: 'White label', description: 'White-label branding and visual overrides.' },
  { key: 'supportSla', label: 'Support SLA', description: 'Premium support SLA and escalations.' },
] as const;

export type BillingFeatureKey = (typeof BILLING_FEATURE_CATALOG)[number]['key'];

export const BILLING_FEATURE_KEYS = BILLING_FEATURE_CATALOG.map((item) => item.key) as BillingFeatureKey[];

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function normalizeFeatureValue(value: unknown): boolean {
  if (value === true) return true;
  if (value === false || value == null) return false;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (!v) return false;
    return ['1', 'true', 'yes', 'enabled', 'on', 'active', 'included'].includes(v);
  }
  return Boolean(value);
}

export function normalizeFeatureMap(value: unknown): Record<BillingFeatureKey, boolean> {
  const source = asRecord(value);
  const out = {} as Record<BillingFeatureKey, boolean>;
  for (const key of BILLING_FEATURE_KEYS) out[key] = normalizeFeatureValue(source[key]);
  return out;
}

export function mergePlanFeatures(plan: BillingPlanSeed, overrides?: Record<string, unknown> | null) {
  return normalizeFeatureMap({ ...(plan.defaultFeatures ?? {}), ...(overrides ?? {}) });
}
