-- Initial MySQL schema baseline generated from backend/prisma/schema.prisma.
-- This migration replaces unsafe production schema sync fallbacks with committed migration history.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `tenants` (
  `id` CHAR(36) NOT NULL,
  `slug` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `status` ENUM('active','suspended','archived') NOT NULL DEFAULT 'active',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenants_slug_key` (`slug`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `users` (
  `id` CHAR(36) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `password_hash` VARCHAR(191) NULL,
  `google_sub` VARCHAR(191) NULL,
  `email_verified` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_key` (`email`),
  UNIQUE KEY `users_google_sub_key` (`google_sub`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `email_verification_tokens` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `token_hash` VARCHAR(191) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `consumed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `email_verification_tokens_token_hash_key` (`token_hash`),
  INDEX `email_verification_tokens_user_id_idx` (`user_id`),
  INDEX `email_verification_tokens_expires_at_idx` (`expires_at`),
  CONSTRAINT `email_verification_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `billing_plans` (
  `code` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
  `monthly_price_minor` INTEGER NULL,
  `yearly_price_minor` INTEGER NULL,
  `included_seats` INTEGER NULL,
  `default_limits` JSON NULL,
  `default_features` JSON NULL,
  `is_public` BOOLEAN NOT NULL DEFAULT true,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tenant_settings` (
  `tenant_id` CHAR(36) NOT NULL,
  `locale` VARCHAR(191) NOT NULL DEFAULT 'ar',
  `timezone` VARCHAR(191) NOT NULL DEFAULT 'Africa/Cairo',
  `country_code` VARCHAR(191) NULL,
  `branding` JSON NULL,
  `features` JSON NULL,
  PRIMARY KEY (`tenant_id`),
  CONSTRAINT `tenant_settings_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tenant_plans` (
  `tenant_id` CHAR(36) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `seat_limit` INTEGER NULL,
  `limits` JSON NULL,
  `features` JSON NULL,
  `renews_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`tenant_id`),
  INDEX `tenant_plans_code_idx` (`code`),
  CONSTRAINT `tenant_plans_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tenant_billing_profiles` (
  `tenant_id` CHAR(36) NOT NULL,
  `provider` ENUM('manual','stripe','lemon_squeezy') NOT NULL DEFAULT 'manual',
  `billing_email` VARCHAR(191) NULL,
  `billing_name` VARCHAR(191) NULL,
  `country_code` VARCHAR(191) NULL,
  `tax_id` VARCHAR(191) NULL,
  `currency` VARCHAR(191) NULL DEFAULT 'USD',
  `external_customer_id` VARCHAR(191) NULL,
  `provider_metadata` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`tenant_id`),
  UNIQUE KEY `tenant_billing_profiles_external_customer_id_key` (`external_customer_id`),
  CONSTRAINT `tenant_billing_profiles_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tenant_subscriptions` (
  `tenant_id` CHAR(36) NOT NULL,
  `provider` ENUM('manual','stripe','lemon_squeezy') NOT NULL DEFAULT 'manual',
  `external_subscription_id` VARCHAR(191) NULL,
  `status` ENUM('trialing','active','past_due','paused','canceled','expired') NOT NULL DEFAULT 'trialing',
  `plan_code` VARCHAR(191) NOT NULL,
  `interval` ENUM('monthly','yearly','custom') NOT NULL DEFAULT 'monthly',
  `seats` INTEGER NOT NULL DEFAULT 1,
  `started_at` DATETIME(3) NULL,
  `trial_ends_at` DATETIME(3) NULL,
  `current_period_start` DATETIME(3) NULL,
  `current_period_end` DATETIME(3) NULL,
  `cancel_at_period_end` BOOLEAN NOT NULL DEFAULT false,
  `provider_metadata` JSON NULL,
  `last_webhook_event_id` VARCHAR(191) NULL,
  `last_webhook_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`tenant_id`),
  UNIQUE KEY `tenant_subscriptions_external_subscription_id_key` (`external_subscription_id`),
  INDEX `tenant_subscriptions_plan_code_idx` (`plan_code`),
  CONSTRAINT `tenant_subscriptions_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `billing_webhook_events` (
  `id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NULL,
  `provider` ENUM('manual','stripe','lemon_squeezy') NOT NULL,
  `external_event_id` VARCHAR(191) NULL,
  `event_type` VARCHAR(191) NOT NULL,
  `signature_valid` BOOLEAN NOT NULL DEFAULT false,
  `processed` BOOLEAN NOT NULL DEFAULT false,
  `status_code` INTEGER NULL,
  `error_message` TEXT NULL,
  `payload` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `processed_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `billing_webhook_events_provider_external_event_id_key` (`provider`, `external_event_id`),
  INDEX `billing_webhook_events_tenant_id_created_at_idx` (`tenant_id`, `created_at`),
  INDEX `billing_webhook_events_provider_created_at_idx` (`provider`, `created_at`),
  CONSTRAINT `billing_webhook_events_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tenant_invites` (
  `id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `role` ENUM('tenant_owner','tenant_admin','ops_manager','station_manager','line_supervisor','viewer') NOT NULL,
  `token` VARCHAR(191) NOT NULL,
  `invited_by_id` CHAR(36) NULL,
  `status` ENUM('pending','accepted','revoked','expired') NOT NULL DEFAULT 'pending',
  `expires_at` DATETIME(3) NOT NULL,
  `accepted_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_invites_token_key` (`token`),
  INDEX `tenant_invites_tenant_id_status_idx` (`tenant_id`, `status`),
  INDEX `tenant_invites_email_status_idx` (`email`, `status`),
  CONSTRAINT `tenant_invites_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `tenant_invites_invited_by_id_fkey` FOREIGN KEY (`invited_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tenant_memberships` (
  `id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `role` ENUM('tenant_owner','tenant_admin','ops_manager','station_manager','line_supervisor','viewer') NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `accepted_at` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenant_memberships_tenant_id_user_id_key` (`tenant_id`, `user_id`),
  INDEX `tenant_memberships_user_id_idx` (`user_id`),
  CONSTRAINT `tenant_memberships_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `tenant_memberships_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `refresh_tokens` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `token_hash` VARCHAR(191) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `revoked_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `refresh_tokens_token_hash_key` (`token_hash`),
  INDEX `refresh_tokens_user_id_idx` (`user_id`),
  CONSTRAINT `refresh_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_roles` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `role` ENUM('passenger','platform_owner','station_operator','platform_admin','support_agent') NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_roles_user_id_role_key` (`user_id`, `role`),
  CONSTRAINT `user_roles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cities` (
  `id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NULL,
  `slug` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `cities_tenant_id_slug_key` (`tenant_id`, `slug`),
  INDEX `cities_tenant_id_idx` (`tenant_id`),
  CONSTRAINT `cities_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `stations` (
  `id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NULL,
  `city_id` CHAR(36) NULL,
  `name` VARCHAR(191) NOT NULL,
  `area` VARCHAR(191) NULL,
  `lat` DOUBLE NOT NULL,
  `lng` DOUBLE NOT NULL,
  `is_published` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `stations_tenant_id_idx` (`tenant_id`),
  INDEX `stations_city_id_idx` (`city_id`),
  CONSTRAINT `stations_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `stations_city_id_fkey` FOREIGN KEY (`city_id`) REFERENCES `cities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `profiles` (
  `id` CHAR(36) NOT NULL,
  `display_name` VARCHAR(191) NULL,
  `avatar_url` VARCHAR(191) NULL,
  `default_station_id` CHAR(36) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `profiles_default_station_id_fkey` (`default_station_id`),
  CONSTRAINT `profiles_id_fkey` FOREIGN KEY (`id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `profiles_default_station_id_fkey` FOREIGN KEY (`default_station_id`) REFERENCES `stations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `station_layouts` (
  `id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NULL,
  `station_id` CHAR(36) NOT NULL,
  `viewbox` VARCHAR(191) NOT NULL DEFAULT '0 0 100 100',
  `notes` TEXT NULL,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `station_layouts_tenant_id_idx` (`tenant_id`),
  INDEX `station_layouts_station_id_idx` (`station_id`),
  CONSTRAINT `station_layouts_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `station_layouts_station_id_fkey` FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `layout_zones` (
  `id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NULL,
  `station_id` CHAR(36) NOT NULL,
  `zone_key` VARCHAR(191) NOT NULL,
  `label` VARCHAR(191) NULL,
  `x` DECIMAL(10,4) NOT NULL,
  `y` DECIMAL(10,4) NOT NULL,
  `w` DECIMAL(10,4) NOT NULL,
  `h` DECIMAL(10,4) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `layout_zones_tenant_id_idx` (`tenant_id`),
  INDEX `layout_zones_station_id_idx` (`station_id`),
  CONSTRAINT `layout_zones_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `layout_zones_station_id_fkey` FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lines` (
  `id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NULL,
  `station_id` CHAR(36) NOT NULL,
  `destination` VARCHAR(191) NOT NULL,
  `color` VARCHAR(191) NOT NULL DEFAULT '#FFC800',
  `vehicle_type` ENUM('ميكروباص','أتوبيس','ميني_باص','تاكسي') NOT NULL DEFAULT 'ميكروباص',
  `status` ENUM('active','paused','closed') NOT NULL DEFAULT 'active',
  `cars` INTEGER NOT NULL DEFAULT 0,
  `pickup_area` VARCHAR(191) NULL,
  `zone_x` DECIMAL(10,4) NULL,
  `zone_y` DECIMAL(10,4) NULL,
  `zone_w` DECIMAL(10,4) NULL,
  `zone_h` DECIMAL(10,4) NULL,
  `is_published` BOOLEAN NOT NULL DEFAULT false,
  `cars_updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `lines_tenant_id_idx` (`tenant_id`),
  INDEX `lines_station_id_idx` (`station_id`),
  CONSTRAINT `lines_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `lines_station_id_fkey` FOREIGN KEY (`station_id`) REFERENCES `stations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `route_stops` (
  `id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NULL,
  `line_id` CHAR(36) NOT NULL,
  `position` INTEGER NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `lat` DOUBLE NOT NULL,
  `lng` DOUBLE NOT NULL,
  `keywords` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `route_stops_tenant_id_idx` (`tenant_id`),
  INDEX `route_stops_line_id_position_idx` (`line_id`, `position`),
  CONSTRAINT `route_stops_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `route_stops_line_id_fkey` FOREIGN KEY (`line_id`) REFERENCES `lines`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `availability_logs` (
  `id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NULL,
  `line_id` CHAR(36) NOT NULL,
  `cars` INTEGER NOT NULL,
  `status` ENUM('active','paused','closed') NOT NULL,
  `changed_by` CHAR(36) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `availability_logs_tenant_id_idx` (`tenant_id`),
  INDEX `availability_logs_line_id_created_at_idx` (`line_id`, `created_at`),
  INDEX `availability_logs_changed_by_fkey` (`changed_by`),
  CONSTRAINT `availability_logs_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `availability_logs_line_id_fkey` FOREIGN KEY (`line_id`) REFERENCES `lines`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `availability_logs_changed_by_fkey` FOREIGN KEY (`changed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `favorites` (
  `id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NULL,
  `user_id` CHAR(36) NOT NULL,
  `kind` VARCHAR(191) NOT NULL,
  `ref_id` CHAR(36) NULL,
  `label` VARCHAR(191) NULL,
  `payload` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `favorites_tenant_id_idx` (`tenant_id`),
  INDEX `favorites_user_id_idx` (`user_id`),
  CONSTRAINT `favorites_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `favorites_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `search_logs` (
  `id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NULL,
  `user_id` CHAR(36) NULL,
  `query` TEXT NOT NULL,
  `result_count` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `search_logs_tenant_id_idx` (`tenant_id`),
  INDEX `search_logs_created_at_idx` (`created_at`),
  INDEX `search_logs_user_id_fkey` (`user_id`),
  CONSTRAINT `search_logs_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `search_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NULL,
  `actor_id` CHAR(36) NULL,
  `entity` VARCHAR(191) NOT NULL,
  `entity_id` CHAR(36) NULL,
  `action` VARCHAR(191) NOT NULL,
  `diff` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `audit_logs_tenant_id_idx` (`tenant_id`),
  INDEX `audit_logs_entity_entity_id_idx` (`entity`, `entity_id`),
  INDEX `audit_logs_created_at_idx` (`created_at`),
  INDEX `audit_logs_actor_id_fkey` (`actor_id`),
  CONSTRAINT `audit_logs_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `audit_logs_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `draft_changes` (
  `id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NULL,
  `author_id` CHAR(36) NOT NULL,
  `entity` VARCHAR(191) NOT NULL,
  `entity_id` CHAR(36) NULL,
  `patch` JSON NOT NULL,
  `status` ENUM('pending','approved','rejected','applied') NOT NULL DEFAULT 'pending',
  `note` TEXT NULL,
  `applied_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `draft_changes_tenant_id_idx` (`tenant_id`),
  INDEX `draft_changes_status_idx` (`status`),
  INDEX `draft_changes_entity_entity_id_idx` (`entity`, `entity_id`),
  INDEX `draft_changes_author_id_fkey` (`author_id`),
  CONSTRAINT `draft_changes_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `draft_changes_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
