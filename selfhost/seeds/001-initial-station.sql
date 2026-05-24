-- Idempotent initial production seed for Mwasalat self-hosted MySQL.
-- Adds one tenant, one city, one published station, a layout, zones, published lines, route stops,
-- and initial availability logs. Safe to run more than once.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 1;

START TRANSACTION;

-- Stable IDs make the seed idempotent and easy to verify.
SET @tenant_id = '11111111-1111-4111-8111-111111111111';
SET @city_id = '22222222-2222-4222-8222-222222222222';
SET @station_id = '33333333-3333-4333-8333-333333333333';
SET @layout_id = '44444444-4444-4444-8444-444444444444';
SET @zone_north_id = '55555555-5555-4555-8555-555555555551';
SET @zone_east_id = '55555555-5555-4555-8555-555555555552';
SET @line_shubra_id = '66666666-6666-4666-8666-666666666661';
SET @line_heliopolis_id = '66666666-6666-4666-8666-666666666662';

INSERT INTO tenants (id, slug, name, status, created_at, updated_at)
VALUES (@tenant_id, 'mwasalat-eg-demo', 'Mwasalat Egypt Demo', 'active', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  status = VALUES(status),
  updated_at = NOW();

INSERT INTO tenant_settings (tenant_id, locale, timezone, country_code, branding, features)
VALUES (
  @tenant_id,
  'ar',
  'Africa/Cairo',
  'EG',
  JSON_OBJECT('appName', 'مواصلات', 'primaryColor', '#FFC800'),
  JSON_OBJECT('initialSeed', true, 'publicStations', true)
)
ON DUPLICATE KEY UPDATE
  locale = VALUES(locale),
  timezone = VALUES(timezone),
  country_code = VALUES(country_code),
  branding = VALUES(branding),
  features = VALUES(features);

INSERT INTO tenant_plans (tenant_id, code, status, seat_limit, limits, features, created_at, updated_at)
VALUES (
  @tenant_id,
  'starter',
  'active',
  5,
  JSON_OBJECT('stations', 10, 'lines', 100),
  JSON_OBJECT('manualBilling', true, 'stationOps', true),
  NOW(),
  NOW()
)
ON DUPLICATE KEY UPDATE
  code = VALUES(code),
  status = VALUES(status),
  seat_limit = VALUES(seat_limit),
  limits = VALUES(limits),
  features = VALUES(features),
  updated_at = NOW();

INSERT INTO tenant_billing_profiles (tenant_id, provider, billing_email, billing_name, country_code, currency, created_at, updated_at)
VALUES (@tenant_id, 'manual', 'ops@mwasalat.local', 'Mwasalat Egypt Demo', 'EG', 'USD', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  provider = VALUES(provider),
  billing_email = VALUES(billing_email),
  billing_name = VALUES(billing_name),
  country_code = VALUES(country_code),
  currency = VALUES(currency),
  updated_at = NOW();

INSERT INTO tenant_subscriptions (
  tenant_id,
  provider,
  status,
  plan_code,
  `interval`,
  seats,
  started_at,
  current_period_start,
  current_period_end,
  cancel_at_period_end,
  created_at,
  updated_at
)
VALUES (
  @tenant_id,
  'manual',
  'active',
  'starter',
  'monthly',
  5,
  NOW(),
  NOW(),
  DATE_ADD(NOW(), INTERVAL 30 DAY),
  0,
  NOW(),
  NOW()
)
ON DUPLICATE KEY UPDATE
  provider = VALUES(provider),
  status = VALUES(status),
  plan_code = VALUES(plan_code),
  `interval` = VALUES(`interval`),
  seats = VALUES(seats),
  current_period_start = VALUES(current_period_start),
  current_period_end = VALUES(current_period_end),
  cancel_at_period_end = VALUES(cancel_at_period_end),
  updated_at = NOW();

INSERT INTO cities (id, tenant_id, slug, name, created_at)
VALUES (@city_id, @tenant_id, 'cairo', 'القاهرة', NOW())
ON DUPLICATE KEY UPDATE
  tenant_id = VALUES(tenant_id),
  slug = VALUES(slug),
  name = VALUES(name);

INSERT INTO stations (id, tenant_id, city_id, name, area, lat, lng, is_published, provenance, provenance_detail, created_at, updated_at)
VALUES (@station_id, @tenant_id, @city_id, 'موقف رمسيس', 'وسط القاهرة', 30.0626, 31.2497, 1, 'seed', 'selfhost/seeds/001-initial-station.sql', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  tenant_id = VALUES(tenant_id),
  city_id = VALUES(city_id),
  name = VALUES(name),
  area = VALUES(area),
  lat = VALUES(lat),
  lng = VALUES(lng),
  is_published = VALUES(is_published),
  provenance = VALUES(provenance),
  provenance_detail = VALUES(provenance_detail),
  updated_at = NOW();

INSERT INTO station_layouts (id, tenant_id, station_id, viewbox, notes, updated_at)
VALUES (@layout_id, @tenant_id, @station_id, '0 0 100 100', 'Seeded production starter layout for Ramses station.', NOW())
ON DUPLICATE KEY UPDATE
  tenant_id = VALUES(tenant_id),
  station_id = VALUES(station_id),
  viewbox = VALUES(viewbox),
  notes = VALUES(notes),
  updated_at = NOW();

INSERT INTO layout_zones (id, tenant_id, station_id, zone_key, label, x, y, w, h, created_at)
VALUES
  (@zone_north_id, @tenant_id, @station_id, 'north-platform', 'الرصيف الشمالي', 8.0000, 15.0000, 38.0000, 18.0000, NOW()),
  (@zone_east_id, @tenant_id, @station_id, 'east-platform', 'الرصيف الشرقي', 54.0000, 15.0000, 38.0000, 18.0000, NOW())
ON DUPLICATE KEY UPDATE
  tenant_id = VALUES(tenant_id),
  station_id = VALUES(station_id),
  zone_key = VALUES(zone_key),
  label = VALUES(label),
  x = VALUES(x),
  y = VALUES(y),
  w = VALUES(w),
  h = VALUES(h);

INSERT INTO `lines` (
  id,
  tenant_id,
  station_id,
  destination,
  color,
  vehicle_type,
  status,
  cars,
  pickup_area,
  zone_x,
  zone_y,
  zone_w,
  zone_h,
  is_published,
  cars_updated_at,
  created_at,
  updated_at
)
VALUES
  (@line_shubra_id, @tenant_id, @station_id, 'شبرا الخيمة', '#FFC800', 'ميكروباص', 'active', 6, 'الرصيف الشمالي - بجوار البوابة الرئيسية', 8.0000, 15.0000, 38.0000, 18.0000, 1, NOW(), NOW(), NOW()),
  (@line_heliopolis_id, @tenant_id, @station_id, 'مصر الجديدة', '#2563EB', 'أتوبيس', 'active', 3, 'الرصيف الشرقي - أمام الكشك', 54.0000, 15.0000, 38.0000, 18.0000, 1, NOW(), NOW(), NOW())
ON DUPLICATE KEY UPDATE
  tenant_id = VALUES(tenant_id),
  station_id = VALUES(station_id),
  destination = VALUES(destination),
  color = VALUES(color),
  vehicle_type = VALUES(vehicle_type),
  status = VALUES(status),
  cars = VALUES(cars),
  pickup_area = VALUES(pickup_area),
  zone_x = VALUES(zone_x),
  zone_y = VALUES(zone_y),
  zone_w = VALUES(zone_w),
  zone_h = VALUES(zone_h),
  is_published = VALUES(is_published),
  cars_updated_at = NOW(),
  updated_at = NOW();

INSERT INTO route_stops (id, tenant_id, line_id, position, name, lat, lng, keywords, created_at)
VALUES
  ('77777777-7777-4777-8777-777777777711', @tenant_id, @line_shubra_id, 1, 'موقف رمسيس', 30.0626, 31.2497, JSON_ARRAY('رمسيس', 'ramses'), NOW()),
  ('77777777-7777-4777-8777-777777777712', @tenant_id, @line_shubra_id, 2, 'كوبري الليمون', 30.0712, 31.2456, JSON_ARRAY('كوبري الليمون'), NOW()),
  ('77777777-7777-4777-8777-777777777713', @tenant_id, @line_shubra_id, 3, 'روض الفرج', 30.0832, 31.2426, JSON_ARRAY('روض الفرج'), NOW()),
  ('77777777-7777-4777-8777-777777777714', @tenant_id, @line_shubra_id, 4, 'شبرا الخيمة', 30.1281, 31.2444, JSON_ARRAY('شبرا', 'شبرا الخيمة'), NOW()),
  ('77777777-7777-4777-8777-777777777721', @tenant_id, @line_heliopolis_id, 1, 'موقف رمسيس', 30.0626, 31.2497, JSON_ARRAY('رمسيس', 'ramses'), NOW()),
  ('77777777-7777-4777-8777-777777777722', @tenant_id, @line_heliopolis_id, 2, 'العباسية', 30.0735, 31.2755, JSON_ARRAY('العباسية'), NOW()),
  ('77777777-7777-4777-8777-777777777723', @tenant_id, @line_heliopolis_id, 3, 'ميدان الجيش', 30.0792, 31.2799, JSON_ARRAY('ميدان الجيش'), NOW()),
  ('77777777-7777-4777-8777-777777777724', @tenant_id, @line_heliopolis_id, 4, 'ميدان الحجاز', 30.0985, 31.3306, JSON_ARRAY('الحجاز', 'مصر الجديدة'), NOW())
ON DUPLICATE KEY UPDATE
  tenant_id = VALUES(tenant_id),
  line_id = VALUES(line_id),
  position = VALUES(position),
  name = VALUES(name),
  lat = VALUES(lat),
  lng = VALUES(lng),
  keywords = VALUES(keywords);

INSERT INTO availability_logs (id, tenant_id, line_id, cars, status, changed_by, created_at)
VALUES
  ('88888888-8888-4888-8888-888888888881', @tenant_id, @line_shubra_id, 6, 'active', NULL, NOW()),
  ('88888888-8888-4888-8888-888888888882', @tenant_id, @line_heliopolis_id, 3, 'active', NULL, NOW())
ON DUPLICATE KEY UPDATE
  tenant_id = VALUES(tenant_id),
  line_id = VALUES(line_id),
  cars = VALUES(cars),
  status = VALUES(status),
  changed_by = VALUES(changed_by),
  created_at = VALUES(created_at);

COMMIT;

SELECT
  s.id AS station_id,
  s.name AS station_name,
  s.area,
  COUNT(DISTINCT l.id) AS lines_count,
  COUNT(rs.id) AS stops_count
FROM stations s
LEFT JOIN `lines` l ON l.station_id = s.id
LEFT JOIN route_stops rs ON rs.line_id = l.id
WHERE s.id = @station_id
GROUP BY s.id, s.name, s.area;
