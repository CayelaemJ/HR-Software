BEGIN;
-- Every existing document becomes quarantined until a configured scanner checks it.
ALTER TABLE candidate_documents
  ADD COLUMN scan_status text NOT NULL DEFAULT 'pending'
    CHECK(scan_status IN ('pending','clean','infected','scan_error')),
  ADD COLUMN scan_engine text,
  ADD COLUMN scan_checked_at timestamptz;
CREATE INDEX candidate_documents_scan_idx
  ON candidate_documents(tenant_id,scan_status,created_at DESC);
CREATE INDEX candidate_documents_expiration_idx
  ON candidate_documents(expires_at);

CREATE TABLE document_retention_runs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES organizations(id),
 removed_count integer NOT NULL CHECK(removed_count > 0),
 ran_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_retention_runs_tenant_idx
 ON document_retention_runs(tenant_id,ran_at DESC);
ALTER TABLE document_retention_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_retention_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY document_retention_runs_tenant ON document_retention_runs
 USING(tenant_id=app_tenant_id()) WITH CHECK(tenant_id=app_tenant_id());
COMMIT;
