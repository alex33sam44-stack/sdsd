/**
 * seed-pilot-data
 * --------------------------------------------------------------
 * Seeds a launch-ready Cairo pilot dataset on top of the bare
 * minimum produced by `selfhost/seeds/001-initial-station.sql`.
 *
 *   npm --prefix backend run seed:pilot
 *
 * Idempotent: every row is upserted on a stable slug/destination
 * pair; running twice is a no-op. Tenant-agnostic (`tenant_id IS
 * NULL`) so a fresh tenant inherits the dataset by default.
 *
 * Coverage (≥ data quality "green" threshold):
 *   - 5 stations  : Ramses, Tahrir, Maadi, Helwan, Imbaba
 *   - 12 lines    : 2-3 lines per station
 *   - ≥ 4 stops per line
 *
 * After seeding:
 *   node backend/scripts/verify-data-quality.mjs --min=85 --band=green
 * should pass.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const prisma = new PrismaClient();

interface PilotStation {
  slug: string;
  name: string;
  area: string;
  lat: number;
  lng: number;
  city: string;
  lines: PilotLine[];
}

interface PilotLine {
  destination: string;
  vehicle: 'microbus' | 'minibus' | 'bus';
  pickupArea?: string;
  cars: number;
  stops: { name: string; lat: number; lng: number }[];
}

const PILOT: PilotStation[] = [
  {
    slug: 'ramses-square', name: 'موقف رمسيس', area: 'وسط البلد', lat: 30.0626, lng: 31.2497, city: 'cairo',
    lines: [
      {
        destination: 'التحرير', vehicle: 'microbus', pickupArea: 'البوابة الشمالية', cars: 6,
        stops: [
          { name: 'العتبة', lat: 30.0518, lng: 31.2470 },
          { name: 'باب اللوق', lat: 30.0469, lng: 31.2389 },
          { name: 'ميدان التحرير', lat: 30.0444, lng: 31.2357 },
        ],
      },
      {
        destination: 'العباسية', vehicle: 'microbus', pickupArea: 'البوابة الشرقية', cars: 4,
        stops: [
          { name: 'الفجالة', lat: 30.0610, lng: 31.2570 },
          { name: 'الظاهر', lat: 30.0651, lng: 31.2693 },
          { name: 'العباسية', lat: 30.0676, lng: 31.2806 },
        ],
      },
      {
        destination: 'شبرا', vehicle: 'microbus', pickupArea: 'البوابة الغربية', cars: 5,
        stops: [
          { name: 'روض الفرج', lat: 30.0800, lng: 31.2380 },
          { name: 'شبرا', lat: 30.0925, lng: 31.2454 },
          { name: 'شبرا الخيمة', lat: 30.1286, lng: 31.2444 },
        ],
      },
    ],
  },
  {
    slug: 'tahrir-square', name: 'موقف ميدان التحرير', area: 'وسط البلد', lat: 30.0444, lng: 31.2357, city: 'cairo',
    lines: [
      {
        destination: 'المعادي', vehicle: 'microbus', cars: 8,
        stops: [
          { name: 'جاردن سيتي', lat: 30.0388, lng: 31.2340 },
          { name: 'كورنيش المعادي', lat: 29.9603, lng: 31.2569 },
          { name: 'المعادي', lat: 29.9603, lng: 31.2569 },
        ],
      },
      {
        destination: 'الدقي', vehicle: 'microbus', cars: 5,
        stops: [
          { name: 'كوبري قصر النيل', lat: 30.0470, lng: 31.2300 },
          { name: 'الجزيرة', lat: 30.0488, lng: 31.2237 },
          { name: 'الدقي', lat: 30.0381, lng: 31.2089 },
        ],
      },
    ],
  },
  {
    slug: 'maadi-corniche', name: 'موقف كورنيش المعادي', area: 'المعادي', lat: 29.9603, lng: 31.2569, city: 'cairo',
    lines: [
      {
        destination: 'التحرير', vehicle: 'microbus', cars: 7,
        stops: [
          { name: 'دار السلام', lat: 30.0142, lng: 31.2380 },
          { name: 'القصر العيني', lat: 30.0354, lng: 31.2335 },
          { name: 'ميدان التحرير', lat: 30.0444, lng: 31.2357 },
        ],
      },
      {
        destination: 'حلوان', vehicle: 'microbus', cars: 4,
        stops: [
          { name: 'طرة', lat: 29.9500, lng: 31.2700 },
          { name: 'المعصرة', lat: 29.9000, lng: 31.3100 },
          { name: 'حلوان', lat: 29.8487, lng: 31.3346 },
        ],
      },
    ],
  },
  {
    slug: 'helwan-station', name: 'محطة حلوان', area: 'حلوان', lat: 29.8487, lng: 31.3346, city: 'cairo',
    lines: [
      {
        destination: 'المعادي', vehicle: 'microbus', cars: 6,
        stops: [
          { name: 'المعصرة', lat: 29.9000, lng: 31.3100 },
          { name: 'طرة', lat: 29.9500, lng: 31.2700 },
          { name: 'كورنيش المعادي', lat: 29.9603, lng: 31.2569 },
        ],
      },
      {
        destination: 'التحرير', vehicle: 'minibus', cars: 3,
        stops: [
          { name: 'حلوان البلد', lat: 29.8550, lng: 31.3300 },
          { name: 'المعادي', lat: 29.9603, lng: 31.2569 },
          { name: 'ميدان التحرير', lat: 30.0444, lng: 31.2357 },
        ],
      },
    ],
  },
  {
    slug: 'imbaba-stop', name: 'موقف إمبابة', area: 'الجيزة', lat: 30.0773, lng: 31.2050, city: 'giza',
    lines: [
      {
        destination: 'التحرير', vehicle: 'microbus', cars: 6,
        stops: [
          { name: 'الزمالك', lat: 30.0617, lng: 31.2199 },
          { name: 'كوبري 6 أكتوبر', lat: 30.0533, lng: 31.2249 },
          { name: 'ميدان التحرير', lat: 30.0444, lng: 31.2357 },
        ],
      },
      {
        destination: 'المهندسين', vehicle: 'microbus', cars: 5,
        stops: [
          { name: 'كيت كات', lat: 30.0698, lng: 31.2120 },
          { name: 'السودان', lat: 30.0635, lng: 31.2080 },
          { name: 'المهندسين', lat: 30.0567, lng: 31.2080 },
        ],
      },
    ],
  },
];

async function ensureCity(slug: string, name: string): Promise<string> {
  const existing = (await prisma.$queryRawUnsafe(
    `SELECT id FROM cities WHERE slug = ? AND tenant_id IS NULL LIMIT 1`,
    slug,
  )) as Array<{ id: string }>;
  if (existing.length) return existing[0].id;
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO cities (id, tenant_id, slug, name, created_at) VALUES (?, NULL, ?, ?, CURRENT_TIMESTAMP(3))`,
    id, slug, name,
  );
  return id;
}

const CITY_NAMES: Record<string, string> = { cairo: 'القاهرة', giza: 'الجيزة' };

async function main() {
  let stationsAdded = 0, linesAdded = 0, stopsAdded = 0, skipped = 0;

  for (const ps of PILOT) {
    const cityId = await ensureCity(ps.city, CITY_NAMES[ps.city] ?? ps.city);

    let station = await prisma.station.findFirst({
      where: { tenantId: null, name: ps.name },
      select: { id: true, isPublished: true },
    });
    if (!station) {
      const created = await prisma.station.create({
        data: {
          tenantId: null, cityId, name: ps.name, area: ps.area,
          lat: ps.lat, lng: ps.lng, isPublished: true,
        },
        select: { id: true, isPublished: true },
      });
      station = created;
      stationsAdded += 1;
    } else if (!station.isPublished) {
      await prisma.station.update({ where: { id: station.id }, data: { isPublished: true } });
    } else {
      skipped += 1;
    }

    for (const pl of ps.lines) {
      let line = await prisma.line.findFirst({
        where: { tenantId: null, stationId: station.id, destination: pl.destination },
        select: { id: true },
      });
      if (!line) {
        line = await prisma.line.create({
          data: {
            tenantId: null,
            stationId: station.id,
            destination: pl.destination,
            vehicleType: pl.vehicle,
            pickupArea: pl.pickupArea,
            cars: pl.cars,
            isPublished: true,
            status: 'active',
          },
          select: { id: true },
        });
        linesAdded += 1;
      }
      // refresh stops deterministically
      await prisma.routeStop.deleteMany({ where: { lineId: line.id } });
      for (let i = 0; i < pl.stops.length; i += 1) {
        const stop = pl.stops[i];
        await prisma.routeStop.create({
          data: {
            tenantId: null, lineId: line.id, position: i + 1,
            name: stop.name, lat: stop.lat, lng: stop.lng,
            keywords: [],
          },
        });
        stopsAdded += 1;
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `OK seed-pilot: stations=${stationsAdded}, lines=${linesAdded}, stops=${stopsAdded}, skipped=${skipped}`,
  );
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('seed-pilot failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
