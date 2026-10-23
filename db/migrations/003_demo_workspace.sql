BEGIN;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE candidate_evidence ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE interview_scorecards ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS demo_seed_runs(
  tenant_id uuid PRIMARY KEY REFERENCES organizations(id),
  seeded_by uuid NOT NULL REFERENCES users(id),
  seeded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE demo_seed_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_seed_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_demo_seed_runs ON demo_seed_runs
  USING (tenant_id=app_tenant_id()) WITH CHECK(tenant_id=app_tenant_id());
COMMIT;
