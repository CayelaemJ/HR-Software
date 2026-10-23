BEGIN;
CREATE TABLE candidate_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES organizations(id),
 candidate_id uuid NOT NULL,
 original_name text NOT NULL CHECK(length(original_name) BETWEEN 1 AND 160),
 media_type text NOT NULL CHECK(media_type IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
 byte_length integer NOT NULL CHECK(byte_length BETWEEN 32 AND 1048576),
 sha256_hex text NOT NULL CHECK(length(sha256_hex)=64),
 content bytea NOT NULL CHECK(octet_length(content)=byte_length),
 uploaded_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '180 days'),
 CONSTRAINT documents_candidate_tenant_fk FOREIGN KEY(tenant_id,candidate_id) REFERENCES candidates(tenant_id,id)
);
CREATE INDEX candidate_documents_tenant_candidate_idx ON candidate_documents(tenant_id,candidate_id,created_at DESC);
ALTER TABLE candidate_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_candidate_documents ON candidate_documents
  USING(tenant_id=app_tenant_id()) WITH CHECK(tenant_id=app_tenant_id());
COMMIT;
