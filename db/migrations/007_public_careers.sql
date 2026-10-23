BEGIN;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS applicant_note text NOT NULL DEFAULT '';
ALTER TABLE applications ADD CONSTRAINT application_note_size CHECK(length(applicant_note)<=2500);
ALTER TABLE applications ADD COLUMN IF NOT EXISTS public_consent_at timestamptz;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS consent_version text;
CREATE TABLE IF NOT EXISTS public_application_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES organizations(id),
 application_id uuid NOT NULL,
 event_type text NOT NULL CHECK(event_type IN ('application_received')),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT public_application_tenant_fk FOREIGN KEY(tenant_id,application_id) REFERENCES applications(tenant_id,id)
);
ALTER TABLE public_application_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_application_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_public_application_events ON public_application_events
  USING(tenant_id=app_tenant_id()) WITH CHECK(tenant_id=app_tenant_id());
COMMIT;
