import { LineStatus, VehicleType } from '@prisma/client';

export function camelizeFlatKeys<T extends Record<string, any>>(input: T): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (value === undefined) continue;
    out[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = value;
  }
  return out;
}

export function normalizeLineStatus(input: unknown): LineStatus | undefined {
  if (input === undefined || input === null || input === '') return undefined;
  const raw = String(input).trim().toLowerCase();
  if (raw === 'active' || raw === 'نشط') return LineStatus.active;
  if (raw === 'crowded' || raw === 'paused' || raw === 'busy' || raw === 'مزدحم' || raw === 'زحمة') {
    return LineStatus.paused;
  }
  if (
    raw === 'stopped' ||
    raw === 'closed' ||
    raw === 'inactive' ||
    raw === 'off' ||
    raw === 'متوقف' ||
    raw === 'موقوف'
  ) {
    return LineStatus.closed;
  }
  return undefined;
}

export function normalizeVehicleType(input: unknown): VehicleType | undefined {
  if (input === undefined || input === null || input === '') return undefined;
  const raw = String(input).trim();
  if (raw === 'microbus' || raw === 'ميكروباص') return VehicleType.microbus;
  if (raw === 'bus' || raw === 'أتوبيس') return VehicleType.bus;
  if (raw === 'minibus' || raw === 'ميني باص' || raw === 'ميني_باص') return VehicleType.minibus;
  if (raw === 'taxi' || raw === 'تاكسي' || raw === 'تاكسي موقف') return VehicleType.taxi;
  return undefined;
}

export function normalizeLineData(input: Record<string, any>): Record<string, any> {
  const data = camelizeFlatKeys(input ?? {});
  if ('status' in data) {
    data.status = normalizeLineStatus(data.status) ?? LineStatus.active;
  }
  if ('vehicleType' in data) {
    data.vehicleType = normalizeVehicleType(data.vehicleType) ?? VehicleType.microbus;
  }
  return data;
}
