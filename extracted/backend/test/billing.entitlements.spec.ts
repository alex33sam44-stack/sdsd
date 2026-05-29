import { BILLING_FEATURE_CATALOG } from '../src/modules/billing/entitlements';

describe('billing entitlement catalog', () => {
  it('contains stable feature keys for guarded admin routes', () => {
    const keys = BILLING_FEATURE_CATALOG.map((item) => item.key);
    expect(keys).toEqual(expect.arrayContaining([
      'drafts',
      'validation',
      'teamManagement',
      'analytics',
      'suggestions',
      'interoperability',
      'importExport',
    ]));
  });
});
