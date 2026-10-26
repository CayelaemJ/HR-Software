BEGIN;
-- A human attestation of handoff, not a verified Sage/vendor API acknowledgement.
ALTER TABLE payroll_export_runs
 ADD COLUMN reconciliation_status text NOT NULL DEFAULT 'pending'
 CHECK(reconciliation_status IN ('pending','accepted','rejected')),
 ADD COLUMN receipt_reference text,
 ADD COLUMN receipt_note text,
 ADD COLUMN reconciled_by uuid REFERENCES users(id),
 ADD COLUMN reconciled_at timestamptz;
ALTER TABLE payroll_export_runs
 ADD CONSTRAINT payroll_reconciliation_is_complete CHECK (
  (reconciliation_status='pending' AND receipt_reference IS NULL AND receipt_note IS NULL
   AND reconciled_by IS NULL AND reconciled_at IS NULL)
  OR
  (reconciliation_status IN ('accepted','rejected') AND receipt_reference IS NOT NULL
   AND length(receipt_reference) BETWEEN 12 AND 250
   AND receipt_note IS NOT NULL AND length(receipt_note) BETWEEN 15 AND 1500
   AND reconciled_by IS NOT NULL AND reconciled_at IS NOT NULL)
 );
CREATE INDEX payroll_unreconciled_by_tenant ON payroll_export_runs(tenant_id,created_at)
 WHERE reconciliation_status='pending';
COMMIT;
