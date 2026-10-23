-- This is the migration referenced in the initial tree, with a one-time setup lock.
BEGIN;
CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS bootstrap_lock (id int PRIMARY KEY CHECK (id=1));
CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT NULLIF(current_setting('app.tenant_id',true),'')::uuid
$$;
CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT NULLIF(current_setting('app.user_id',true),'')::uuid
$$;
CREATE TABLE IF NOT EXISTS organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK(length(name) BETWEEN 2 AND 160), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE, full_name text NOT NULL, password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS memberships (tenant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,role text NOT NULL CHECK(role IN('owner','hr_admin','recruiter','viewer')),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,user_id));
CREATE INDEX IF NOT EXISTS memberships_user_idx ON memberships(user_id);
CREATE TABLE IF NOT EXISTS jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES organizations(id),title text NOT NULL CHECK(length(title) BETWEEN 3 AND 150),department text NOT NULL DEFAULT '',location text NOT NULL DEFAULT '',employment_type text NOT NULL DEFAULT 'full-time',description text NOT NULL,criteria text NOT NULL,status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','published','closed')),created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),published_at timestamptz);
CREATE INDEX IF NOT EXISTS jobs_tenant_status_idx ON jobs(tenant_id,status,created_at DESC);
CREATE TABLE IF NOT EXISTS candidates (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES organizations(id),full_name text NOT NULL CHECK(length(full_name) BETWEEN 2 AND 160),email text NOT NULL,headline text NOT NULL DEFAULT '',notes text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,email));
CREATE INDEX IF NOT EXISTS candidates_tenant_idx ON candidates(tenant_id,created_at DESC);
CREATE TABLE IF NOT EXISTS applications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES organizations(id),job_id uuid NOT NULL REFERENCES jobs(id),candidate_id uuid NOT NULL REFERENCES candidates(id),stage text NOT NULL DEFAULT 'applied' CHECK(stage IN('applied','human_review','interview','offer','hired','declined','withdrawn')),human_decision_by uuid REFERENCES users(id),decision_reason text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,job_id,candidate_id));
CREATE INDEX IF NOT EXISTS applications_tenant_stage_idx ON applications(tenant_id,stage,updated_at DESC);
CREATE TABLE IF NOT EXISTS audit_events (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES organizations(id),actor_id uuid NOT NULL REFERENCES users(id),action text NOT NULL,object_type text NOT NULL,object_id uuid NOT NULL,details jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS audit_tenant_time_idx ON audit_events(tenant_id,created_at DESC);
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY; ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_organizations ON organizations USING(id=app_tenant_id()) WITH CHECK(id=app_tenant_id());
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY; ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_memberships ON memberships USING(tenant_id=app_tenant_id() OR user_id=app_user_id()) WITH CHECK(tenant_id=app_tenant_id());
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY; ALTER TABLE jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_jobs ON jobs USING(tenant_id=app_tenant_id()) WITH CHECK(tenant_id=app_tenant_id());
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY; ALTER TABLE candidates FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_candidates ON candidates USING(tenant_id=app_tenant_id()) WITH CHECK(tenant_id=app_tenant_id());
ALTER TABLE applications ENABLE ROW LEVEL SECURITY; ALTER TABLE applications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_applications ON applications USING(tenant_id=app_tenant_id()) WITH CHECK(tenant_id=app_tenant_id());
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY; ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_audit_select ON audit_events FOR SELECT USING(tenant_id=app_tenant_id());
CREATE POLICY tenant_audit_insert ON audit_events FOR INSERT WITH CHECK(tenant_id=app_tenant_id() AND actor_id=app_user_id());
CREATE UNIQUE INDEX IF NOT EXISTS jobs_tenant_id_unique ON jobs(tenant_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS candidates_tenant_id_unique ON candidates(tenant_id,id);
ALTER TABLE applications ADD CONSTRAINT applications_job_tenant_fk FOREIGN KEY(tenant_id,job_id) REFERENCES jobs(tenant_id,id);
ALTER TABLE applications ADD CONSTRAINT applications_candidate_tenant_fk FOREIGN KEY(tenant_id,candidate_id) REFERENCES candidates(tenant_id,id);
COMMIT;
