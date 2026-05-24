-- Adds the user_contributions table so user submissions (line/feature) reach the
-- backend and can be moderated. Localstorage on the frontend now becomes an
-- offline cache + retry queue rather than the source of truth.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `user_contributions` (
  `id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NULL,
  `submitted_by_id` CHAR(36) NULL,
  `type` ENUM('station_line','route_feature') NOT NULL,
  `status` ENUM('pending_review','approved','rejected','applied') NOT NULL DEFAULT 'pending_review',
  `station_id` CHAR(36) NULL,
  `station_name` VARCHAR(191) NULL,
  `line_id` CHAR(36) NULL,
  `payload` JSON NOT NULL,
  `reviewer_id` CHAR(36) NULL,
  `review_note` TEXT NULL,
  `reviewed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `user_contributions_tenant_id_idx` (`tenant_id`),
  INDEX `user_contributions_status_idx` (`status`),
  INDEX `user_contributions_type_station_id_idx` (`type`, `station_id`),
  INDEX `user_contributions_type_line_id_idx` (`type`, `line_id`),
  INDEX `user_contributions_submitted_by_id_fkey` (`submitted_by_id`),
  INDEX `user_contributions_reviewer_id_fkey` (`reviewer_id`),
  CONSTRAINT `user_contributions_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `user_contributions_submitted_by_id_fkey` FOREIGN KEY (`submitted_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `user_contributions_reviewer_id_fkey` FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
