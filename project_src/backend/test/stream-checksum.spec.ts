// eslint-disable-next-line @typescript-eslint/no-var-requires
const { summarize, formatSidecar } = require('../../scripts/lib/stream-checksum.cjs');

// ─────────────────────────────────────────────────────────────────────────────
// Streaming backup checksum: pure rules consumed by stream-backup-checksum.mjs.
// The CLI runs against live mysqldump/gzip output and is hard to unit-test
// directly, so we exercise the reduction-equivalent here. Both code paths
// share the same crypto.createHash logic, so a divergence would surface as
// a sha256 mismatch in the round-trip verifier — which is exactly the kind
// of regression we are guarding against.
// ─────────────────────────────────────────────────────────────────────────────

describe('summarize — sha256 + byte count over chunks', () => {
  it('matches sha256sum for a single chunk', () => {
    // sha256('hello world\n') is the canonical fixture used by sha256sum.
    const result = summarize([Buffer.from('hello world\n')]);
    expect(result.bytes).toBe(12);
    expect(result.sha256).toBe('a948904f2f0f479b8f8197694b30184b0d2ed1c1cd2a1ec0fb85d299a192a447');
  });

  it('produces the same digest whether the input is split into chunks or not', () => {
    const data = Buffer.from('the quick brown fox jumps over the lazy dog');
    const whole = summarize([data]);
    const split = summarize([data.subarray(0, 10), data.subarray(10, 25), data.subarray(25)]);
    expect(split.sha256).toBe(whole.sha256);
    expect(split.bytes).toBe(whole.bytes);
  });

  it('accepts strings and buffers interchangeably', () => {
    // The CLI writes Buffers, but tests find it easier to pass strings.
    // The shared module must treat them identically.
    const fromString = summarize(['abc']);
    const fromBuffer = summarize([Buffer.from('abc')]);
    expect(fromString).toEqual(fromBuffer);
  });

  it('skips null / undefined chunks gracefully (empty stream artefacts)', () => {
    // Some Node stream paths yield a trailing null on close. Treat as no-op.
    const result = summarize(['data', null, undefined, 'more']);
    expect(result.bytes).toBe('datamore'.length);
  });

  it('returns the sha256 of the empty string for an empty stream', () => {
    // Important: a 0-byte dump must NOT be passed off as valid. The bash
    // wrapper checks bytes > 0, so we must accurately report zero.
    const empty = summarize([]);
    expect(empty.bytes).toBe(0);
    expect(empty.sha256).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('throws when given a non-array', () => {
    // Defensive: catches a CLI bug where someone passes a single Buffer
    // instead of [Buffer]. Better to crash loudly than silently report
    // wrong totals.
    expect(() => summarize('a string' as any)).toThrow(TypeError);
    expect(() => summarize(Buffer.from('x') as any)).toThrow(TypeError);
    expect(() => summarize(null as any)).toThrow(TypeError);
  });

  it('handles binary data (non-UTF-8 bytes) without corruption', () => {
    // Real mysql dumps contain arbitrary binary in BLOB columns. The hash
    // must be byte-exact, not text-encoded.
    const buf = Buffer.from([0x00, 0xff, 0x80, 0x7f, 0x01]);
    const result = summarize([buf]);
    expect(result.bytes).toBe(5);
    // sha256 of those exact 5 bytes; verified independently with sha256sum.
    expect(result.sha256).toBe('3a86dc68e4bb109f2be75997e71d9176a8b652eba4331b8fbe1b61e7d674976c');
  });

  it('counts bytes accurately across many small chunks', () => {
    // 10000 single-byte chunks — exercises the loop, not the hasher.
    const chunks = Array.from({ length: 10000 }, () => Buffer.from('x'));
    const result = summarize(chunks);
    expect(result.bytes).toBe(10000);
  });
});

describe('formatSidecar — sha256sum-compatible output', () => {
  it('emits "<sha256>  <name>\\n" matching sha256sum convention', () => {
    // Two spaces between hash and filename is the historical convention.
    // Tools that consume the sidecar (sha256sum -c, our own roundtrip
    // verifier, third-party auditors) all rely on this exact format.
    const out = formatSidecar({ sha256: 'a'.repeat(64), name: 'dump.sql.gz' });
    expect(out).toBe('a'.repeat(64) + '  dump.sql.gz\n');
  });

  it('lower-cases an upper-case hash', () => {
    // sha256sum always emits lower-case. Mirror that to avoid spurious
    // "tampered" alerts on case-sensitive comparators.
    const out = formatSidecar({ sha256: 'A'.repeat(64), name: 'dump.sql.gz' });
    expect(out).toBe('a'.repeat(64) + '  dump.sql.gz\n');
  });

  it('rejects malformed sha256 values', () => {
    expect(() => formatSidecar({ sha256: 'short', name: 'x' })).toThrow();
    expect(() => formatSidecar({ sha256: 'g'.repeat(64), name: 'x' })).toThrow();
    expect(() => formatSidecar({ sha256: 'a'.repeat(63), name: 'x' })).toThrow();
  });

  it('rejects empty / non-string names', () => {
    expect(() => formatSidecar({ sha256: 'a'.repeat(64), name: '' })).toThrow();
    expect(() => formatSidecar({ sha256: 'a'.repeat(64), name: 12 as any })).toThrow();
  });
});
