-- Intercity routes layer: long-haul transit between Egyptian cities.
-- Independent from the (intracity) Line model so we can model
-- carrier identity, schedule windows, fare bands, and amenities
-- without overloading the existing schema.

CREATE TABLE `intercity_routes` (
  `id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NULL,
  `from_city_id` CHAR(36) NOT NULL,
  `to_city_id` CHAR(36) NOT NULL,
  `carrier` VARCHAR(64) NOT NULL,
  `vehicle_type` VARCHAR(32) NOT NULL DEFAULT 'bus',
  `distance_km` INT NULL,
  `duration_minutes` INT NULL,
  `fare_min` DECIMAL(10,2) NULL,
  `fare_max` DECIMAL(10,2) NULL,
  `currency` VARCHAR(8) NOT NULL DEFAULT 'EGP',
  `frequency_label` VARCHAR(64) NULL,
  `amenities` JSON NOT NULL DEFAULT (JSON_ARRAY()),
  `is_published` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `intercity_tenant_idx` (`tenant_id`),
  INDEX `intercity_from_idx` (`from_city_id`, `is_published`),
  INDEX `intercity_to_idx` (`to_city_id`, `is_published`),
  CONSTRAINT `intercity_tenant_fk` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE SET NULL,
  CONSTRAINT `intercity_from_fk` FOREIGN KEY (`from_city_id`) REFERENCES `cities`(`id`) ON DELETE CASCADE,
  CONSTRAINT `intercity_to_fk` FOREIGN KEY (`to_city_id`) REFERENCES `cities`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `intercity_schedules` (
  `id` CHAR(36) NOT NULL,
  `route_id` CHAR(36) NOT NULL,
  `depart_time` VARCHAR(8) NOT NULL,
  `arrive_time` VARCHAR(8) NULL,
  `days_of_week` VARCHAR(16) NOT NULL DEFAULT '1234567',
  `seats_total` INT NULL,
  `notes` VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  INDEX `schedule_route_idx` (`route_id`),
  CONSTRAINT `schedule_route_fk` FOREIGN KEY (`route_id`) REFERENCES `intercity_routes`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
