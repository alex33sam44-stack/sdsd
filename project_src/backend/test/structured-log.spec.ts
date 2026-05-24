import { logStructured, normalizeError, randomRequestId } from '../src/common/observability/structured-log';

// ─────────────────────────────────────────────────────────────────────────────
// The structured-log module is the only place we emit JSON log lines that ship
// to our log aggregator. Each test pins one observable promise of that contract
// (level filtering, JSON shape, error normalization, request-id uniqueness) so
// downstream alerts don't break silently.
// ─────────────────────────────────────────────────────────────────────────────

describe('logStructured', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  const originalLevel = process.env.LOG_LEVEL;
  const originalVersion = process.env.APP_VERSION;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    if (originalLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = originalLevel;
    if (originalVersion === undefined) delete process.env.APP_VERSION;
    else process.env.APP_VERSION = originalVersion;
  });

  it('emits a JSON line on the appropriate console stream per level', () => {
    process.env.LOG_LEVEL = 'debug';
    logStructured('info', { event: 'unit.info' });
    logStructured('warn', { event: 'unit.warn' });
    logStructured('error', { event: 'unit.error' });

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    const parsed = JSON.parse(logSpy.mock.calls[0][0]);
    expect(parsed.event).toBe('unit.info');
    expect(parsed.level).toBe('info');
    expect(parsed.service).toBe('mwasalat-backend');
    expect(typeof parsed.ts).toBe('string');
    // Default release tag must be present so log queries can split releases.
    expect(parsed.release).toBeDefined();
  });

  it('honours LOG_LEVEL by suppressing levels below the threshold', () => {
    process.env.LOG_LEVEL = 'warn';
    logStructured('debug', { event: 'unit.debug' });
    logStructured('info', { event: 'unit.info' });
    logStructured('warn', { event: 'unit.warn' });

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to "info" when LOG_LEVEL is unrecognized', () => {
    process.env.LOG_LEVEL = 'verbose-typo';
    logStructured('debug', { event: 'unit.debug' });
    logStructured('info', { event: 'unit.info' });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(logSpy.mock.calls[0][0]);
    expect(parsed.event).toBe('unit.info');
  });

  it('forwards requestId and arbitrary payload fields as-is', () => {
    process.env.LOG_LEVEL = 'info';
    logStructured('info', { event: 'unit.with-rid', requestId: 'rid-123', extra: { k: 1 } });

    const parsed = JSON.parse(logSpy.mock.calls[0][0]);
    expect(parsed.requestId).toBe('rid-123');
    expect(parsed.extra).toEqual({ k: 1 });
  });

  it('writes requestId as null when not supplied', () => {
    process.env.LOG_LEVEL = 'info';
    logStructured('info', { event: 'unit.no-rid' });
    const parsed = JSON.parse(logSpy.mock.calls[0][0]);
    expect(parsed.requestId).toBeNull();
  });

  it('uses APP_VERSION when set', () => {
    process.env.LOG_LEVEL = 'info';
    process.env.APP_VERSION = 'v1.2.3';
    logStructured('info', { event: 'unit.release' });
    const parsed = JSON.parse(logSpy.mock.calls[0][0]);
    expect(parsed.release).toBe('v1.2.3');
  });
});

describe('normalizeError', () => {
  it('extracts name, message, and stack from a real Error', () => {
    const err = new Error('boom');
    const normalized = normalizeError(err);
    expect(normalized).toMatchObject({ name: 'Error', message: 'boom' });
    expect(typeof normalized.stack).toBe('string');
  });

  it('serializes string-like non-Error values via message', () => {
    expect(normalizeError('plain string')).toEqual({ message: 'plain string', raw: 'plain string' });
    expect(normalizeError(42)).toEqual({ message: '42', raw: 42 });
  });

  it('handles null / undefined without throwing', () => {
    expect(normalizeError(null)).toEqual({ message: null, raw: null });
    expect(normalizeError(undefined)).toEqual({ message: null, raw: null });
  });

  it('serializes plain objects rather than printing [object Object]', () => {
    const result = normalizeError({ code: 'X', detail: 'y' });
    expect(typeof result.message).toBe('string');
    // Either way, the readable message must mention the object content, not be opaque.
    expect(result.message).toContain('X');
  });
});

describe('randomRequestId', () => {
  it('generates unique RFC-4122 v4 ids', () => {
    const a = randomRequestId();
    const b = randomRequestId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
