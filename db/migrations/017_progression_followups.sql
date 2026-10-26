BEGIN;
-- Keep follow-up evidence auditable, tenant-isolated and distinct from final HR decisions.
CREATE UNIQUE INDEX IF NOT EXISTS progression_cases_tenant_id_unique ON progression_cases(tenant_id,id);
CREATE TABLE IF NOT EXISTS progression_followups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES organizations(id),
 case_id uuid NOT NULL,
 event_kind text NOT NULL CHECK(event_kind IN ('review_started','evidence_requested','escalated','next_action_set')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 20 AND 2000),
 public_summary text NOT NULL DEFAULT '' CHECK(length(public_summary)<=800),
 next_action_date date,
 recorded_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT progression_followup_same_tenant FOREIGN KEY(tenant_id,case_id)
  REFERENCES progression_cases(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS progression_followups_case_idx ON progression_followups(tenant_id,case_id,created_at DESC);
ALTER TABLE progression_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE progression_followups FORCE ROW LEVEL SECURITY;
CREATE POLICY progression_followup_tenant ON progression_followups
 USING(tenant_id=app_tenant_id()) WITH CHECK(tenant_id=app_tenant_id());
COMMIT;
