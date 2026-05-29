-- Deprecated no-op seed.
-- platform_admin accounts are intentionally NOT created by static SQL seed files.
-- Use selfhost/scripts/grant-platform-admin.sh with ADMIN_EMAIL on the VPS instead.
-- This avoids packaging a reusable admin password hash in the release artifact.
SELECT 'platform_admin static seed disabled; use grant-platform-admin.sh' AS message;
