-- Adds the push_subscriptions table so the backend can deliver Web Push
-- notifications (alerts, line updates) to subscribed clients via VAPID.
-- Idempotent — safe to re-run.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `tenant_id` CHAR(36) NULL,
  `endpoint` TEXT NOT NULL,
  `endpoint_hash` CHAR(64) NOT NULL,
  `p256dh` VARCHAR(255) NOT NULL,
  `auth_key` VARCHAR(255) NOT NULL,
  `user_agent` VARCHAR(255) NULL,
  `last_success_at` DATETIME(3) NULL,
  `last_failure_at` DATETIME(3) NULL,
  `failure_reason` VARCHAR(255) NULL,
  `consecutive_failures` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `push_subscriptions_endpoint_hash_key` (`endpoint_hash`),
  INDEX `push_subscriptions_user_id_idx` (`user_id`),
  INDEX `push_subscriptions_tenant_id_idx` (`tenant_id`),
  CONSTRAINT `push_subscriptions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `push_subscriptions_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
