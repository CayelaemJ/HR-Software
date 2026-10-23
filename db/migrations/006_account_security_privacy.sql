BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS privacy_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES organizations(id),
 subject_user_id uuid NOT NULL REFERENCES users(id),
 request_type text NOT NULL CHECK(request_type IN ('access','export','correction','erasure','objection')),
 details text NOT NULL DEFAULT '' CHECK(length(details)<=3000),
 status text NOT NULL DEFAULT 'received' CHECK(status IN ('received','in_review','completed','declined')),
 response_note text NOT NULL DEFAULT '',
 reviewed_by uuid REFERENCES users(id),
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT privacy_subject_tenant_fk FOREIGN KEY (tenant_id,subject_user_id) REFERENCES memberships(tenant_id,user_id)
);
CREATE INDEX IF NOT EXISTS privacy_requests_tenant_time_idx ON privacy_requests(tenant_id,created_at DESC);
ALTER TABLE privacy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY privacy_requests_read ON privacy_requests FOR SELECT USING(tenant_id=app_tenant_id());
CREATE POLICY privacy_requests_insert ON privacy_requests FOR INSERT WITH CHECK(tenant_id=app_tenant_id() AND subject_user_id=app_user_id());
CREATE POLICY privacy_requests_update ON privacy_requests FOR UPDATE USING(tenant_id=app_tenant_id()) WITH CHECK(tenant_id=app_tenant_id());
-- Admin response updates intentionally limited by API and audited; database updates do not alter the subject.
COMMIT;
