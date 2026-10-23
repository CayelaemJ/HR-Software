BEGIN;
-- Evidence provenance is never inferred from a job match or an AI score.
CREATE UNIQUE INDEX IF NOT EXISTS applications_tenant_unique_id ON applications(tenant_id,id);
CREATE TABLE IF NOT EXISTS candidate_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id),
  candidate_id uuid NOT NULL,
  claim_type text NOT NULL CHECK(claim_type IN ('skill','qualification','experience','project','registration','other')),
  claim_text text NOT NULL CHECK(length(claim_text) BETWEEN 5 AND 4000),
  source_kind text NOT NULL DEFAULT 'candidate_statement' CHECK(source_kind IN ('candidate_statement','document_excerpt','third_party_verification')),
  source_note text NOT NULL DEFAULT '' CHECK(length(source_note) <= 2000),
  review_status text NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','reviewed','verified','disputed')),
  verification_reference text,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evidence_verification_required CHECK(review_status <> 'verified' OR (verification_reference IS NOT NULL AND length(verification_reference) >= 12)),
  CONSTRAINT evidence_candidate_tenant_fk FOREIGN KEY(tenant_id,candidate_id) REFERENCES candidates(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS evidence_tenant_candidate_idx ON candidate_evidence(tenant_id,candidate_id,created_at DESC);
CREATE TABLE IF NOT EXISTS interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id),
  application_id uuid NOT NULL,
  scheduled_at timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'Africa/Johannesburg',
  location text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','cancelled')),
  interviewer_id uuid NOT NULL REFERENCES users(id),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interviews_application_tenant_fk FOREIGN KEY(tenant_id,application_id) REFERENCES applications(tenant_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS interviews_tenant_id_unique ON interviews(tenant_id,id);
CREATE INDEX IF NOT EXISTS interviews_tenant_schedule_idx ON interviews(tenant_id,scheduled_at);
CREATE TABLE IF NOT EXISTS interview_scorecards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES organizations(id),
  interview_id uuid NOT NULL,
  criterion text NOT NULL CHECK(length(criterion) BETWEEN 4 AND 200),
  observation text NOT NULL CHECK(length(observation) BETWEEN 12 AND 4000),
  finding text NOT NULL CHECK(finding IN ('evidence_observed','follow_up_required','not_observed')),
  reviewer_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scorecard_interview_tenant_fk FOREIGN KEY(tenant_id,interview_id) REFERENCES interviews(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS scorecards_tenant_interview_idx ON interview_scorecards(tenant_id,interview_id,created_at DESC);
ALTER TABLE candidate_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_candidate_evidence ON candidate_evidence USING(tenant_id=app_tenant_id()) WITH CHECK(tenant_id=app_tenant_id());
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviews FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_interviews ON interviews USING(tenant_id=app_tenant_id()) WITH CHECK(tenant_id=app_tenant_id());
ALTER TABLE interview_scorecards ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_scorecards FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_interview_scorecards ON interview_scorecards USING(tenant_id=app_tenant_id()) WITH CHECK(tenant_id=app_tenant_id());
COMMIT;
