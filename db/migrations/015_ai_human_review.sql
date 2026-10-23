BEGIN;
-- Audit AI output provenance without candidate profiles or protected attributes.
CREATE TABLE ai_question_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES organizations(id),
 job_id uuid NOT NULL,
 model_provider text NOT NULL CHECK(model_provider='groq'),
 model_name text NOT NULL CHECK(length(model_name) BETWEEN 2 AND 120),
 input_sha256 text NOT NULL CHECK(input_sha256 ~ '^[0-9a-f]{64}$'),
 questions jsonb NOT NULL CHECK(jsonb_typeof(questions)='array'),
 status text NOT NULL DEFAULT 'pending_review'
   CHECK(status IN ('pending_review','approved','rejected')),
 generated_by uuid NOT NULL REFERENCES users(id),
 reviewed_by uuid REFERENCES users(id),
 review_reason text CHECK(review_reason IS NULL OR length(review_reason) BETWEEN 12 AND 2000),
 reviewer_independent boolean,
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz,
 CONSTRAINT ai_drafts_job_tenant_fk FOREIGN KEY(tenant_id,job_id) REFERENCES jobs(tenant_id,id),
 CONSTRAINT ai_review_consistency CHECK(
  (status='pending_review' AND reviewed_by IS NULL AND reviewed_at IS NULL)
  OR
  (status IN ('approved','rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_reason IS NOT NULL)
 )
);
CREATE INDEX ai_question_drafts_tenant_job_idx ON ai_question_drafts(tenant_id,job_id,created_at DESC);
ALTER TABLE ai_question_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_question_drafts FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_question_drafts_tenant ON ai_question_drafts
 USING(tenant_id=app_tenant_id()) WITH CHECK(tenant_id=app_tenant_id());
COMMIT;
