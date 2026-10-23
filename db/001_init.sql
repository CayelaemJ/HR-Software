BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{3,48}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 180),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  email text NOT NULL,
  full_name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK(role IN ('owner','hr','recruiter','employee')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,email)
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  member_id uuid NOT NULL REFERENCES members(id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS vacancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  title text NOT NULL CHECK(length(title) BETWEEN 3 AND 180),
  description text NOT NULL CHECK(length(description) BETWEEN 10 AND 10000),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','open','closed')),
  created_by uuid NOT NULL REFERENCES members(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vacancies_tenant_created_idx ON vacancies(tenant_id,created_at DESC);
CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  vacancy_id uuid NOT NULL REFERENCES vacancies(id),
  candidate_name text NOT NULL,
  candidate_email text NOT NULL,
  stage text NOT NULL DEFAULT 'received' CHECK(stage IN ('received','review','interview','offer','hired','withdrawn','declined')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS applications_tenant_vacancy_idx ON applications(tenant_id,vacancy_id);
-- Tenant scope is enforced on all tenant-owned business tables.
-- The server sets app.tenant_id using SET LOCAL in each transaction.
DO $$
DECLARE tbl text;
BEGIN
 FOREACH tbl IN ARRAY ARRAY['members','sessions','vacancies','applications'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tbl);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tbl);
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I',tbl);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid)',tbl);
 END LOOP;
END $$;
COMMIT;
