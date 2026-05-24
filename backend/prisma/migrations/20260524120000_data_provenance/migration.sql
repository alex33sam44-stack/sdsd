-- Adds provenance tracking to stations, lines, and route_stops so the operator
-- can distinguish seed data from GTFS imports, manual admin edits, community
-- contributions, and field surveys. All columns are nullable with a default of
-- 'unknown' so existing rows get a safe value without a blocking migration.

SET NAMES utf8mb4;

ALTER TABLE `stations`
  ADD COLUMN `provenance` ENUM('seed','manual_admin','gtfs_import','community_contribution','field_survey','unknown') NULL DEFAULT 'unknown' AFTER `is_published`,
  ADD COLUMN `provenance_detail` VARCHAR(500) NULL AFTER `provenance`;

ALTER TABLE `lines`
  ADD COLUMN `provenance` ENUM('seed','manual_admin','gtfs_import','community_contribution','field_survey','unknown') NULL DEFAULT 'unknown' AFTER `is_published`,
  ADD COLUMN `provenance_detail` VARCHAR(500) NULL AFTER `provenance`;

ALTER TABLE `route_stops`
  ADD COLUMN `provenance` ENUM('seed','manual_admin','gtfs_import','community_contribution','field_survey','unknown') NULL DEFAULT 'unknown' AFTER `keywords`,
  ADD COLUMN `provenance_detail` VARCHAR(500) NULL AFTER `provenance`;

-- Backfill existing seed data: stations inserted by the initial seed script
-- have the well-known stable ID starting with 33333333. Mark them explicitly.
UPDATE `stations` SET `provenance` = 'seed', `provenance_detail` = 'selfhost/seeds/001-initial-station.sql'
  WHERE `id` = '33333333-3333-4333-8333-333333333333' AND `provenance` = 'unknown';

UPDATE `lines` SET `provenance` = 'seed', `provenance_detail` = 'selfhost/seeds/001-initial-station.sql'
  WHERE `id` IN ('66666666-6666-4666-8666-666666666661', '66666666-6666-4666-8666-666666666662') AND `provenance` = 'unknown';
