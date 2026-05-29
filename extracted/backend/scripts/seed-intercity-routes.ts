/**
 * Seed a curated set of intercity routes between major Egyptian cities.
 * Tenant-agnostic (`tenant_id IS NULL`) so any tenant sees them by default.
 *
 *   npm --prefix backend run seed:intercity
 *
 * Idempotent: rows are upserted on (from_city_id, to_city_id, carrier).
 * Each route ships with one or two representative schedules so the UI
 * has something to render before operators add real timetables.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const prisma = new PrismaClient();

interface SeedRoute {
  fromSlug: string;
  toSlug: string;
  carrier: string;
  vehicleType: 'bus' | 'minibus' | 'microbus' | 'shared_taxi' | 'train';
  distanceKm: number;
  durationMinutes: number;
  fareMin: number;
  fareMax: number;
  amenities: string[];
  schedules: Array<{ depart: string; arrive?: string; days?: string }>;
}

const ROUTES: SeedRoute[] = [
  {
    fromSlug: 'cairo', toSlug: 'alexandria',
    carrier: 'GoBus', vehicleType: 'bus',
    distanceKm: 220, durationMinutes: 180, fareMin: 180, fareMax: 240,
    amenities: ['wifi', 'ac', 'usb', 'snack'],
    schedules: [
      { depart: '06:00', arrive: '09:00' },
      { depart: '09:30', arrive: '12:30' },
      { depart: '14:00', arrive: '17:00' },
      { depart: '18:00', arrive: '21:00' },
    ],
  },
  {
    fromSlug: 'cairo', toSlug: 'alexandria',
    carrier: 'سوبر جيت', vehicleType: 'bus',
    distanceKm: 220, durationMinutes: 195, fareMin: 150, fareMax: 200,
    amenities: ['ac', 'usb'],
    schedules: [{ depart: '07:00' }, { depart: '11:00' }, { depart: '15:00' }, { depart: '19:00' }],
  },
  {
    fromSlug: 'cairo', toSlug: 'mansoura',
    carrier: 'ميكروباص الموقف', vehicleType: 'microbus',
    distanceKm: 130, durationMinutes: 150, fareMin: 80, fareMax: 110,
    amenities: ['ac'],
    schedules: [{ depart: '05:30' }, { depart: '08:30' }, { depart: '13:00' }, { depart: '17:30' }],
  },
  {
    fromSlug: 'cairo', toSlug: 'tanta',
    carrier: 'ميكروباص الموقف', vehicleType: 'microbus',
    distanceKm: 95, durationMinutes: 110, fareMin: 60, fareMax: 80,
    amenities: [],
    schedules: [{ depart: '06:00' }, { depart: '09:00' }, { depart: '14:00' }, { depart: '18:00' }],
  },
  {
    fromSlug: 'cairo', toSlug: 'ismailia',
    carrier: 'East Delta', vehicleType: 'bus',
    distanceKm: 140, durationMinutes: 150, fareMin: 70, fareMax: 95,
    amenities: ['ac', 'usb'],
    schedules: [{ depart: '07:00', arrive: '09:30' }, { depart: '13:00', arrive: '15:30' }, { depart: '18:00', arrive: '20:30' }],
  },
  {
    fromSlug: 'cairo', toSlug: 'suez',
    carrier: 'East Delta', vehicleType: 'bus',
    distanceKm: 135, durationMinutes: 140, fareMin: 70, fareMax: 90,
    amenities: ['ac'],
    schedules: [{ depart: '06:00' }, { depart: '11:00' }, { depart: '15:00' }, { depart: '19:30' }],
  },
  {
    fromSlug: 'cairo', toSlug: 'port-said',
    carrier: 'GoBus', vehicleType: 'bus',
    distanceKm: 220, durationMinutes: 210, fareMin: 165, fareMax: 215,
    amenities: ['wifi', 'ac', 'usb'],
    schedules: [{ depart: '07:30', arrive: '11:00' }, { depart: '14:30', arrive: '18:00' }],
  },
  {
    fromSlug: 'cairo', toSlug: 'asyut',
    carrier: 'سوبر جيت', vehicleType: 'bus',
    distanceKm: 375, durationMinutes: 360, fareMin: 235, fareMax: 320,
    amenities: ['ac', 'usb'],
    schedules: [{ depart: '08:00', arrive: '14:00' }, { depart: '21:00', arrive: '03:00' }],
  },
  {
    fromSlug: 'cairo', toSlug: 'minya',
    carrier: 'ميكروباص الموقف', vehicleType: 'microbus',
    distanceKm: 245, durationMinutes: 240, fareMin: 130, fareMax: 170,
    amenities: ['ac'],
    schedules: [{ depart: '07:00' }, { depart: '13:00' }, { depart: '19:00' }],
  },
  {
    fromSlug: 'cairo', toSlug: 'luxor',
    carrier: 'GoBus', vehicleType: 'bus',
    distanceKm: 650, durationMinutes: 600, fareMin: 380, fareMax: 520,
    amenities: ['wifi', 'ac', 'usb', 'snack', 'sleeper'],
    schedules: [{ depart: '20:00', arrive: '06:00', days: '1234567' }],
  },
  {
    fromSlug: 'cairo', toSlug: 'aswan',
    carrier: 'GoBus', vehicleType: 'bus',
    distanceKm: 880, durationMinutes: 780, fareMin: 460, fareMax: 620,
    amenities: ['wifi', 'ac', 'usb', 'snack', 'sleeper'],
    schedules: [{ depart: '18:00', arrive: '07:00', days: '1234567' }],
  },
  {
    fromSlug: 'cairo', toSlug: 'red-sea',
    carrier: 'GoBus', vehicleType: 'bus',
    distanceKm: 460, durationMinutes: 360, fareMin: 280, fareMax: 380,
    amenities: ['wifi', 'ac', 'usb'],
    schedules: [{ depart: '07:30', arrive: '13:30' }, { depart: '14:00', arrive: '20:00' }, { depart: '23:00', arrive: '05:00' }],
  },
  {
    fromSlug: 'cairo', toSlug: 'sharm',
    carrier: 'East Delta', vehicleType: 'bus',
    distanceKm: 490, durationMinutes: 420, fareMin: 260, fareMax: 360,
    amenities: ['ac', 'usb'],
    schedules: [{ depart: '08:00', arrive: '15:00' }, { depart: '23:30', arrive: '06:30' }],
  },
  {
    fromSlug: 'alexandria', toSlug: 'mansoura',
    carrier: 'ميكروباص الموقف', vehicleType: 'microbus',
    distanceKm: 145, durationMinutes: 165, fareMin: 90, fareMax: 120,
    amenities: ['ac'],
    schedules: [{ depart: '06:30' }, { depart: '10:00' }, { depart: '14:30' }, { depart: '18:30' }],
  },
  {
    fromSlug: 'alexandria', toSlug: 'matruh',
    carrier: 'West Delta', vehicleType: 'bus',
    distanceKm: 290, durationMinutes: 240, fareMin: 160, fareMax: 220,
    amenities: ['ac', 'usb'],
    schedules: [{ depart: '07:00' }, { depart: '11:00' }, { depart: '16:00' }],
  },
];

async function findCity(slug: string): Promise<string | null> {
  const row = (await prisma.$queryRawUnsafe(
    `SELECT id FROM cities WHERE slug = ? AND tenant_id IS NULL LIMIT 1`,
    slug,
  )) as Array<{ id: string }>;
  if (row.length) return row[0].id;
  // Fallback: pick any tenant's record so the seeder still works on
  // a database where every City was scoped to a tenant.
  const any = (await prisma.$queryRawUnsafe(
    `SELECT id FROM cities WHERE slug = ? LIMIT 1`,
    slug,
  )) as Array<{ id: string }>;
  return any.length ? any[0].id : null;
}

async function ensureCity(slug: string, name: string, lat: number, lng: number): Promise<string> {
  const id = await findCity(slug);
  if (id) return id;
  const newId = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO cities (id, tenant_id, slug, name, created_at) VALUES (?, NULL, ?, ?, CURRENT_TIMESTAMP(3))`,
    newId,
    slug,
    name,
  );
  return newId;
}

const REQUIRED_CITIES: Array<{ slug: string; name: string; lat: number; lng: number }> = [
  { slug: 'cairo', name: 'القاهرة', lat: 30.0444, lng: 31.2357 },
  { slug: 'alexandria', name: 'الإسكندرية', lat: 31.2001, lng: 29.9187 },
  { slug: 'mansoura', name: 'المنصورة', lat: 31.0364, lng: 31.3807 },
  { slug: 'tanta', name: 'طنطا', lat: 30.7865, lng: 31.0004 },
  { slug: 'ismailia', name: 'الإسماعيلية', lat: 30.5965, lng: 32.2715 },
  { slug: 'suez', name: 'السويس', lat: 29.9737, lng: 32.5263 },
  { slug: 'port-said', name: 'بورسعيد', lat: 31.2653, lng: 32.3019 },
  { slug: 'asyut', name: 'أسيوط', lat: 27.1809, lng: 31.1837 },
  { slug: 'minya', name: 'المنيا', lat: 28.0871, lng: 30.7618 },
  { slug: 'luxor', name: 'الأقصر', lat: 25.6872, lng: 32.6396 },
  { slug: 'aswan', name: 'أسوان', lat: 24.0889, lng: 32.8998 },
  { slug: 'red-sea', name: 'الغردقة', lat: 27.2579, lng: 33.8116 },
  { slug: 'sharm', name: 'شرم الشيخ', lat: 27.9158, lng: 34.3300 },
  { slug: 'matruh', name: 'مرسى مطروح', lat: 31.3525, lng: 27.2453 },
];

async function main() {
  // 1) make sure the cities we reference exist
  const cityIds: Record<string, string> = {};
  for (const c of REQUIRED_CITIES) {
    cityIds[c.slug] = await ensureCity(c.slug, c.name, c.lat, c.lng);
  }

  let inserted = 0;
  let updated = 0;
  for (const r of ROUTES) {
    const fromId = cityIds[r.fromSlug];
    const toId = cityIds[r.toSlug];
    if (!fromId || !toId) continue;

    const existing = (await prisma.$queryRawUnsafe(
      `SELECT id FROM intercity_routes
        WHERE tenant_id IS NULL AND from_city_id = ? AND to_city_id = ? AND carrier = ?
        LIMIT 1`,
      fromId,
      toId,
      r.carrier,
    )) as Array<{ id: string }>;

    let routeId: string;
    if (existing.length) {
      routeId = existing[0].id;
      await prisma.$executeRawUnsafe(
        `UPDATE intercity_routes
            SET vehicle_type = ?, distance_km = ?, duration_minutes = ?,
                fare_min = ?, fare_max = ?, amenities = ?, is_published = TRUE,
                updated_at = CURRENT_TIMESTAMP(3)
          WHERE id = ?`,
        r.vehicleType,
        r.distanceKm,
        r.durationMinutes,
        r.fareMin,
        r.fareMax,
        JSON.stringify(r.amenities),
        routeId,
      );
      // refresh the schedule list to keep things deterministic
      await prisma.$executeRawUnsafe(`DELETE FROM intercity_schedules WHERE route_id = ?`, routeId);
      updated += 1;
    } else {
      routeId = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO intercity_routes
           (id, tenant_id, from_city_id, to_city_id, carrier, vehicle_type,
            distance_km, duration_minutes, fare_min, fare_max, currency,
            amenities, is_published, created_at, updated_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'EGP', ?, TRUE,
                 CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
        routeId,
        fromId,
        toId,
        r.carrier,
        r.vehicleType,
        r.distanceKm,
        r.durationMinutes,
        r.fareMin,
        r.fareMax,
        JSON.stringify(r.amenities),
      );
      inserted += 1;
    }

    for (const s of r.schedules) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO intercity_schedules
           (id, route_id, depart_time, arrive_time, days_of_week)
         VALUES (?, ?, ?, ?, ?)`,
        randomUUID(),
        routeId,
        s.depart,
        s.arrive ?? null,
        s.days ?? '1234567',
      );
    }
  }

  // eslint-disable-next-line no-console
  console.log(`OK seed-intercity: ${inserted} inserted, ${updated} updated, ${ROUTES.length} routes total`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('seed-intercity failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
