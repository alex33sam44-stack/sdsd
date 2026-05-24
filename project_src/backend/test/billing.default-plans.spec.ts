import { DEFAULT_BILLING_PLANS } from '../src/modules/billing/default-plans';
import { BILLING_FEATURE_KEYS, mergePlanFeatures, normalizeFeatureMap, normalizeFeatureValue } from '../src/modules/billing/entitlements';

// ─────────────────────────────────────────────────────────────────────────────
// Billing seeds drive what tenants on each plan can do. We pin the invariants
// the rest of the system relies on, so a careless plan edit fails CI before it
// lands in production and silently changes a tenant's entitlements.
// ─────────────────────────────────────────────────────────────────────────────

describe('DEFAULT_BILLING_PLANS — structural invariants', () => {
  it('uses unique plan codes', () => {
    const codes = DEFAULT_BILLING_PLANS.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('declares every feature in BILLING_FEATURE_KEYS for every plan', () => {
    // If a new feature is added to the catalog without seeding it on every
    // plan, tenants on that plan would silently default to false. This test
    // makes that omission a hard CI failure.
    for (const plan of DEFAULT_BILLING_PLANS) {
      const declared = Object.keys(plan.defaultFeatures ?? {});
      for (const key of BILLING_FEATURE_KEYS) {
        expect(declared).toContain(key);
      }
    }
  });

  it('keeps the starter plan free of paid-only features by default', () => {
    const starter = DEFAULT_BILLING_PLANS.find((p) => p.code === 'starter');
    expect(starter).toBeDefined();
    expect(starter!.defaultFeatures.analytics).toBe(false);
    expect(starter!.defaultFeatures.suggestions).toBe(false);
    expect(starter!.defaultFeatures.interoperability).toBe(false);
    expect(starter!.defaultFeatures.importExport).toBe(false);
    // But the day-one operator workflow must still be usable for free.
    expect(starter!.defaultFeatures.validation).toBe(true);
    expect(starter!.defaultFeatures.drafts).toBe(true);
  });

  it('keeps the enterprise plan unlimited and fully featured', () => {
    const ent = DEFAULT_BILLING_PLANS.find((p) => p.code === 'enterprise');
    expect(ent).toBeDefined();
    expect(ent!.includedSeats).toBeNull();
    expect(ent!.defaultLimits.stations).toBeNull();
    expect(ent!.defaultLimits.lines).toBeNull();
    for (const key of BILLING_FEATURE_KEYS) {
      expect(ent!.defaultFeatures[key]).toBe(true);
    }
  });

  it('hides legacy plan from the public catalog', () => {
    const legacy = DEFAULT_BILLING_PLANS.find((p) => p.code === 'legacy');
    expect(legacy?.isPublic).toBe(false);
  });

  it('orders public plans by sortOrder so the UI renders them stably', () => {
    const publicPlans = DEFAULT_BILLING_PLANS.filter((p) => p.isPublic);
    const sorted = [...publicPlans].sort((a, b) => a.sortOrder - b.sortOrder);
    expect(publicPlans.map((p) => p.code)).toEqual(sorted.map((p) => p.code));
  });
});

describe('normalizeFeatureValue', () => {
  it.each([
    [true, true],
    [false, false],
    [null, false],
    [undefined, false],
    [0, false],
    [1, true],
    [42, true],
    [-1, false],
    ['', false],
    ['true', true],
    ['TRUE', true],
    ['  yes  ', true],
    ['enabled', true],
    ['on', true],
    ['active', true],
    ['included', true],
    ['no', false],
    ['off', false],
    ['random', false],
  ])('coerces %p to %p', (input, expected) => {
    expect(normalizeFeatureValue(input)).toBe(expected);
  });
});

describe('normalizeFeatureMap', () => {
  it('returns an entry for every catalog key, defaulting unknowns to false', () => {
    const result = normalizeFeatureMap({});
    for (const key of BILLING_FEATURE_KEYS) {
      expect(result).toHaveProperty(key, false);
    }
  });

  it('ignores keys outside the catalog so unknown feature flags cannot leak in', () => {
    const result = normalizeFeatureMap({ analytics: true, mysteryFlag: true } as any);
    expect(result.analytics).toBe(true);
    expect(result).not.toHaveProperty('mysteryFlag');
  });

  it('treats arrays and primitives as empty rather than crashing', () => {
    expect(() => normalizeFeatureMap([] as any)).not.toThrow();
    expect(() => normalizeFeatureMap('not-an-object' as any)).not.toThrow();
    const fromArray = normalizeFeatureMap([] as any);
    for (const key of BILLING_FEATURE_KEYS) expect(fromArray[key]).toBe(false);
  });
});

describe('mergePlanFeatures', () => {
  const starter = DEFAULT_BILLING_PLANS.find((p) => p.code === 'starter')!;

  it('uses plan defaults when no overrides are given', () => {
    const result = mergePlanFeatures(starter, null);
    expect(result.analytics).toBe(false);
    expect(result.validation).toBe(true);
  });

  it('lets per-tenant overrides win over plan defaults', () => {
    const result = mergePlanFeatures(starter, { analytics: true });
    expect(result.analytics).toBe(true);
    // unrelated defaults remain intact
    expect(result.validation).toBe(true);
  });

  it('coerces override values through normalizeFeatureValue', () => {
    const result = mergePlanFeatures(starter, { analytics: 'yes', drafts: 0 } as any);
    expect(result.analytics).toBe(true);
    expect(result.drafts).toBe(false);
  });
});
