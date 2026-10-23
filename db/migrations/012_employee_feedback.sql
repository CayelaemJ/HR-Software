BEGIN;
CREATE TABLE IF NOT EXISTS employee_feedback (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES organizations(id),
 employee_id uuid NOT NULL,
 submitted_by uuid NOT NULL REFERENCES users(id),
 category text NOT NULL CHECK(category IN ('review_comment','development_feedback','profile_correction')),
 message text NOT NULL CHECK(length(message) BETWEEN 12 AND 2500),
 status text NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','acknowledged')),
 acknowledged_by uuid REFERENCES users(id),
 acknowledged_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT employee_feedback_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES employees(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS employee_feedback_tenant_idx ON employee_feedback(tenant_id,employee_id,created_at DESC);
ALTER TABLE employee_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_feedback FORCE ROW LEVEL SECURITY;
CREATE POLICY employee_feedback_scope ON employee_feedback USING(tenant_id=app_tenant_id()) WITH CHECK(tenant_id=app_tenant_id());
COMMIT;
