BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret_encrypted text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_pending_encrypted text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_last_step bigint NOT NULL DEFAULT -1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_recovery_hashes text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE users ADD CONSTRAINT mfa_enabled_requires_secret CHECK(NOT mfa_enabled OR mfa_secret_encrypted IS NOT NULL);
COMMIT;
