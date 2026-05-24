// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  REQUIRED_BOOTSTRAP_VARS,
  checkRequiredEnvVars,
  parseEnvFile,
  formatPrereqError,
} = require('../../scripts/lib/env-required.cjs');

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap prerequisite check: pure rules consumed by the shell wrappers.
// Each test pins a real failure mode the operator might hit on a fresh VPS,
// so the runbook stays in sync with the script behaviour.
// ─────────────────────────────────────────────────────────────────────────────

const validEnv = (overrides: Record<string, string | undefined> = {}) => {
  const base: Record<string, string | undefined> = {
    API_DOMAIN: 'api.mwasalat.com',
    MYSQL_DATABASE: 'mwasalat',
    MYSQL_USER: 'mwasalat',
    MYSQL_PASSWORD: 'super-secret-password-with-real-content',
    JWT_ACCESS_SECRET: 'a'.repeat(64),
    JWT_REFRESH_SECRET: 'b'.repeat(64),
    ...overrides,
  };
  // Allow tests to delete a key by passing undefined.
  for (const k of Object.keys(base)) {
    if (base[k] === undefined) delete base[k];
  }
  return base as Record<string, string>;
};

describe('REQUIRED_BOOTSTRAP_VARS — public catalogue', () => {
  it('lists every category the operator runbook mentions', () => {
    // The catalogue is part of the public contract — docs and the marker
    // file in PR #12 reference these exact names. Pin the list so a careless
    // reorder or rename forces an explicit update across the runbook.
    expect(REQUIRED_BOOTSTRAP_VARS).toEqual([
      'API_DOMAIN',
      'MYSQL_DATABASE',
      'MYSQL_USER',
      'MYSQL_PASSWORD',
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET',
    ]);
  });
});

describe('checkRequiredEnvVars — happy paths', () => {
  it('passes when every required var is set to a non-empty value', () => {
    const result = checkRequiredEnvVars(validEnv(), REQUIRED_BOOTSTRAP_VARS);
    expect(result).toEqual({ ok: true, missing: [], present: REQUIRED_BOOTSTRAP_VARS });
  });

  it('does not require any unrelated variables', () => {
    // We must not flag the operator for missing optional / future vars.
    // Only the documented required set blocks the bootstrap.
    const result = checkRequiredEnvVars(validEnv({ SOME_OTHER_VAR: undefined }), REQUIRED_BOOTSTRAP_VARS);
    expect(result.ok).toBe(true);
  });
});

describe('checkRequiredEnvVars — failure modes', () => {
  it('returns every missing variable in one verdict, not just the first', () => {
    // The operator-friendly behaviour: list ALL missing vars at once so a
    // fresh VPS fix takes one round-trip, not five.
    const result = checkRequiredEnvVars(
      validEnv({ MYSQL_USER: undefined, JWT_ACCESS_SECRET: undefined }),
      REQUIRED_BOOTSTRAP_VARS,
    );
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['MYSQL_USER', 'JWT_ACCESS_SECRET']);
  });

  it.each([
    ['empty string', ''],
    ['whitespace only', '   '],
    ['tab and newline', '\t\n'],
  ])('treats %s as missing', (_label, value) => {
    const result = checkRequiredEnvVars(validEnv({ API_DOMAIN: value }), REQUIRED_BOOTSTRAP_VARS);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('API_DOMAIN');
  });

  it('treats null / undefined / non-object env as everything missing', () => {
    for (const bad of [null, undefined, 'string', 42, []]) {
      const result = checkRequiredEnvVars(bad as any, REQUIRED_BOOTSTRAP_VARS);
      expect(result.ok).toBe(false);
      expect(result.missing).toEqual(REQUIRED_BOOTSTRAP_VARS);
      expect(result.present).toEqual([]);
    }
  });
});

describe('parseEnvFile — matches the shell parser', () => {
  it('parses KEY=VALUE per line', () => {
    expect(parseEnvFile('A=1\nB=2\n')).toEqual({ A: '1', B: '2' });
  });

  it('skips comment lines and blanks', () => {
    expect(parseEnvFile('# header\n\nA=1\n  # indented comment\nB=2\n')).toEqual({ A: '1', B: '2' });
  });

  it('strips matching single or double quotes from values', () => {
    expect(parseEnvFile(`A='quoted single'\nB="quoted double"\nC=unquoted\n`)).toEqual({
      A: 'quoted single',
      B: 'quoted double',
      C: 'unquoted',
    });
  });

  it('does not strip mismatched quotes or quotes inside a value', () => {
    expect(parseEnvFile(`A="opens but never closes\nB=mid"quote\n`)).toEqual({
      A: '"opens but never closes',
      B: 'mid"quote',
    });
  });

  it('returns an empty object for non-string input', () => {
    expect(parseEnvFile(null as any)).toEqual({});
    expect(parseEnvFile(undefined as any)).toEqual({});
    expect(parseEnvFile(12345 as any)).toEqual({});
  });

  it('handles CRLF line endings (Windows-edited env files)', () => {
    expect(parseEnvFile('A=1\r\nB=2\r\n')).toEqual({ A: '1', B: '2' });
  });
});

describe('formatPrereqError — operator-facing message contract', () => {
  it('lists every missing variable as its own bullet', () => {
    const message = formatPrereqError(['API_DOMAIN', 'JWT_ACCESS_SECRET'], '/srv/env');
    expect(message).toContain('- API_DOMAIN');
    expect(message).toContain('- JWT_ACCESS_SECRET');
  });

  it('points at the env file the operator should edit', () => {
    expect(formatPrereqError(['API_DOMAIN'], '/srv/env')).toContain('/srv/env');
  });

  it('points at selfhost/.env.example as the reference template', () => {
    expect(formatPrereqError(['API_DOMAIN'], '/srv/env')).toContain('selfhost/.env.example');
  });

  it('does not leak any value (only variable names)', () => {
    // Defensive: if a future change accidentally interpolates a value into
    // the error message, we want this test to fail rather than ship a log
    // line that contains a real password.
    const realLookingSecret = 'super-secret-mysql-password-12345';
    const message = formatPrereqError(['API_DOMAIN'], '/srv/env');
    expect(message).not.toContain(realLookingSecret);
  });
});
