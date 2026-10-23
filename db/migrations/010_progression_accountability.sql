BEGIN;
CREATE TABLE IF NOT EXISTS progression_cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES organizations(id),
 employee_id uuid NOT NULL,
 related_review_id uuid,
 kind text NOT NULL CHECK(kind IN ('promotion','salary_review','career_development','performance_appeal')),
 evidence_summary text NOT NULL CHECK(length(evidence_summary) BETWEEN 20 AND 6000),
 requested_outcome text NOT NULL CHECK(length(requested_outcome) BETWEEN 10 AND 2000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','under_review','approved','not_approved','closed')),
 decision_reason text,
 decided_by uuid REFERENCES users(id),
 decided_at timestamptz,
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT progression_employee_fk FOREIGN KEY (tenant_id,employee_id) REFERENCES employees(tenant_id,id),
 CONSTRAINT progression_review_fk FOREIGN KEY (tenant_id,related_review_id) REFERENCES performance_reviews(tenant_id,id),
 CONSTRAINT progression_decision_requires_reason CHECK (
  status NOT IN ('approved','not_approved','closed') OR
  (decision_reason IS NOT NULL AND length(decision_reason)>=20 AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
 )
);
CREATE INDEX IF NOT EXISTS progression_tenant_employee_idx ON progression_cases(tenant_id,employee_id,created_at DESC);
CREATE INDEX IF NOT EXISTS progression_tenant_status_idx ON progression_cases(tenant_id,status,created_at DESC);
ALTER TABLE progression_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE progression_cases FORCE ROW LEVEL SECURITY;
CREATE POLICY progression_tenant_policy ON progression_cases USING (tenant_id=app_tenant_id()) WITH CHECK (tenant_id=app_tenant_id());
COMMIT;
