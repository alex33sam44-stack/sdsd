import { LineStatus, VehicleType } from '@prisma/client';
import {
  camelizeFlatKeys,
  normalizeLineData,
  normalizeLineStatus,
  normalizeVehicleType,
} from '../src/common/utils/line-normalize';

// ─────────────────────────────────────────────────────────────────────────────
// These helpers are the front-line normalizer for every line write — every
// import, every API mutation, every CSV upload flows through them. A regression
// here silently corrupts data, so we exercise every branch including the
// Arabic synonyms our operators actually type.
// ─────────────────────────────────────────────────────────────────────────────

describe('camelizeFlatKeys', () => {
  it('converts snake_case keys to camelCase', () => {
    expect(camelizeFlatKeys({ vehicle_type: 'bus', station_id: 'abc' })).toEqual({
      vehicleType: 'bus',
      stationId: 'abc',
    });
  });

  it('drops keys whose value is undefined but preserves null and empty string', () => {
    const out = camelizeFlatKeys({ a: 1, b: undefined, c: null, d: '' });
    expect(out).toEqual({ a: 1, c: null, d: '' });
    expect('b' in out).toBe(false);
  });

  it('returns an empty object for null / undefined input', () => {
    expect(camelizeFlatKeys(null as any)).toEqual({});
    expect(camelizeFlatKeys(undefined as any)).toEqual({});
  });

  it('leaves already-camelCase keys untouched', () => {
    expect(camelizeFlatKeys({ alreadyCamel: 1 })).toEqual({ alreadyCamel: 1 });
  });
});

describe('normalizeLineStatus', () => {
  it.each([
    ['active', LineStatus.active],
    ['ACTIVE', LineStatus.active],
    ['  Active  ', LineStatus.active],
    ['نشط', LineStatus.active],
    ['crowded', LineStatus.paused],
    ['paused', LineStatus.paused],
    ['busy', LineStatus.paused],
    ['مزدحم', LineStatus.paused],
    ['زحمة', LineStatus.paused],
    ['stopped', LineStatus.closed],
    ['closed', LineStatus.closed],
    ['inactive', LineStatus.closed],
    ['off', LineStatus.closed],
    ['متوقف', LineStatus.closed],
    ['موقوف', LineStatus.closed],
  ])('maps %s -> %s', (input, expected) => {
    expect(normalizeLineStatus(input)).toBe(expected);
  });

  it.each([null, undefined, '', '   '])('returns undefined for blank input %p', (input) => {
    // The empty/whitespace cases are important: a partial PATCH should NOT
    // overwrite a line's status with a default just because the field was
    // present-but-empty.
    expect(normalizeLineStatus(input)).toBeUndefined();
  });

  it('returns undefined for unknown labels rather than guessing', () => {
    expect(normalizeLineStatus('something-else')).toBeUndefined();
    expect(normalizeLineStatus(42)).toBeUndefined();
  });
});

describe('normalizeVehicleType', () => {
  it.each([
    ['microbus', VehicleType.microbus],
    ['ميكروباص', VehicleType.microbus],
    ['bus', VehicleType.bus],
    ['أتوبيس', VehicleType.bus],
    ['minibus', VehicleType.minibus],
    ['ميني باص', VehicleType.minibus],
    ['ميني_باص', VehicleType.minibus],
    ['taxi', VehicleType.taxi],
    ['تاكسي', VehicleType.taxi],
    ['تاكسي موقف', VehicleType.taxi],
  ])('maps %s -> %s', (input, expected) => {
    expect(normalizeVehicleType(input)).toBe(expected);
  });

  it('returns undefined for unknown / blank input', () => {
    expect(normalizeVehicleType('hovercraft')).toBeUndefined();
    expect(normalizeVehicleType('')).toBeUndefined();
    expect(normalizeVehicleType(null)).toBeUndefined();
  });
});

describe('normalizeLineData', () => {
  it('camelizes keys and applies defaults only for fields that were present', () => {
    // status field present-but-unrecognized → falls back to active.
    const out = normalizeLineData({ vehicle_type: 'bus', status: 'unknown', other: 'x' });
    expect(out).toEqual({ vehicleType: VehicleType.bus, status: LineStatus.active, other: 'x' });
  });

  it('does not inject status / vehicleType when the caller did not set them', () => {
    // Critical: a partial update must NOT silently change unrelated fields.
    const out = normalizeLineData({ destination: 'Tahrir' });
    expect(out).toEqual({ destination: 'Tahrir' });
    expect('status' in out).toBe(false);
    expect('vehicleType' in out).toBe(false);
  });

  it('translates Arabic status values via the camelized field name', () => {
    const out = normalizeLineData({ status: 'مزدحم' });
    expect(out.status).toBe(LineStatus.paused);
  });

  it('returns an empty object for null / undefined input', () => {
    expect(normalizeLineData(null as any)).toEqual({});
    expect(normalizeLineData(undefined as any)).toEqual({});
  });
});
