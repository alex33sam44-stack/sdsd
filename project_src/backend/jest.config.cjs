/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'test/.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.spec.json' }],
  },
  // Limit coverage to the files we actually exercise — primarily pure
  // helpers and guards. Collecting coverage on Nest controllers / services
  // that require Prisma + DB to run would inflate the "uncovered" surface
  // and produce noisy CI failures. As more unit tests land, expand this
  // glob and tighten the thresholds below.
  collectCoverageFrom: [
    'src/common/utils/**/*.ts',
    'src/common/observability/structured-log.ts',
    'src/common/guards/**/*.ts',
    'src/common/tenancy/tenant-roles.guard.ts',
    'src/modules/billing/entitlements.ts',
    'src/modules/billing/default-plans.ts',
    '!src/**/*.module.ts',
    '!src/**/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'html'],
  // Thresholds are conservative on purpose: they pin the floor of what is
  // actually covered today so a future change cannot silently regress us.
  // Raise these numbers when more unit tests are added.
  coverageThreshold: {
    global: {
      statements: 70,
      branches: 70,
      functions: 70,
      lines: 70,
    },
  },
  testEnvironment: 'node',
};
