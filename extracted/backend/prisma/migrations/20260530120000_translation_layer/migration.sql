-- Translation layer: stores translations for arbitrary entities.
-- This table is the single source of truth for runtime localization of
-- DB-backed content (station names, line destinations, route stops, …)
-- and for cached machine translations of free-text user content.

CREATE TABLE `translations` (
  `id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NULL,
  `entity_type` VARCHAR(64) NOT NULL,
  `entity_id` VARCHAR(191) NOT NULL,
  `field` VARCHAR(64) NOT NULL,
  `locale` VARCHAR(10) NOT NULL,
  `value` TEXT NOT NULL,
  `source` VARCHAR(32) NOT NULL DEFAULT 'machine',
  `source_locale` VARCHAR(10) NOT NULL DEFAULT 'ar',
  `source_hash` CHAR(64) NOT NULL,
  `quality` VARCHAR(16) NOT NULL DEFAULT 'auto',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `translations_uniq` (`entity_type`, `entity_id`, `field`, `locale`),
  INDEX `translations_tenant_idx` (`tenant_id`),
  INDEX `translations_lookup_idx` (`entity_type`, `entity_id`, `locale`),
  INDEX `translations_source_hash_idx` (`source_hash`, `locale`),
  CONSTRAINT `translations_tenant_fk`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Free-text translation cache (independent of any entity, e.g. user-typed
-- chat messages, share captions). Keyed only by content hash + locale so
-- repeated phrases share a single row across tenants.
CREATE TABLE `translation_cache` (
  `id` CHAR(36) NOT NULL,
  `source_hash` CHAR(64) NOT NULL,
  `source_locale` VARCHAR(10) NOT NULL,
  `target_locale` VARCHAR(10) NOT NULL,
  `source_text` TEXT NOT NULL,
  `translated_text` TEXT NOT NULL,
  `provider` VARCHAR(32) NOT NULL DEFAULT 'noop',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_used_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `hit_count` INT NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `translation_cache_uniq` (`source_hash`, `source_locale`, `target_locale`),
  INDEX `translation_cache_last_used` (`last_used_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-locale dictionary overrides (curated/manual). Used by the runtime
-- DOM overlay to override visible UI strings without touching the frozen
-- frontend. Keyed by source phrase normalized hash.
CREATE TABLE `i18n_overrides` (
  `id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NULL,
  `source_locale` VARCHAR(10) NOT NULL DEFAULT 'ar',
  `target_locale` VARCHAR(10) NOT NULL,
  `source_hash` CHAR(64) NOT NULL,
  `source_text` TEXT NOT NULL,
  `translated_text` TEXT NOT NULL,
  `domain` VARCHAR(32) NOT NULL DEFAULT 'ui',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `i18n_overrides_uniq` (`tenant_id`, `target_locale`, `source_hash`, `domain`),
  INDEX `i18n_overrides_target` (`target_locale`, `is_active`),
  CONSTRAINT `i18n_overrides_tenant_fk`
    FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
