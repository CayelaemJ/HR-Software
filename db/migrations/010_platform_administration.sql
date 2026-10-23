BEGIN;
CREATE TABLE IF NOT EXISTS platform_administrators (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 admin_role text NOT NULL DEFAULT 'superadmin' CHECK(admin_role='superadmin'),
 granted_at timestamptz NOT NULL DEFAULT now(),
 reason text NOT NULL DEFAULT 'CABO platform owner'
);
CREATE INDEX IF NOT EXISTS platform_administrators_role_idx ON platform_administrators(admin_role);
COMMIT;
