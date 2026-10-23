BEGIN;
-- No payslips, salaries, national IDs, bank details or applicant data is stored here.
-- Tracks only metadata for a human-reviewed, privacy-minimised payroll handoff.
CREATE TABLE payroll_export_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES organizations(id),
 export_kind text NOT NULL CHECK(export_kind IN ('employee_roster','approved_leave')),
 period_start date NOT NULL,
 period_end date NOT NULL,
 source_format text NOT NULL DEFAULT 'cabo-generic-csv-v1'
   CHECK(source_format = 'cabo-generic-csv-v1'),
 record_count integer NOT NULL CHECK(record_count BETWEEN 0 AND 10000),
 file_sha256 text NOT NULL CHECK(file_sha256 ~ '^[0-9a-f]{64}$'),
 generated_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT payroll_export_period_valid CHECK(period_end>=period_start AND period_end<=period_start + 366)
);
CREATE INDEX payroll_export_runs_tenant_created_idx ON payroll_export_runs(tenant_id,created_at DESC);
ALTER TABLE payroll_export_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_export_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY payroll_export_runs_scope ON payroll_export_runs
 USING(tenant_id=app_tenant_id()) WITH CHECK(tenant_id=app_tenant_id());
COMMIT;
