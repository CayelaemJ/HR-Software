BEGIN;
-- An employee's acknowledgement confirms receipt, never policy agreement or HR completion.
ALTER TABLE onboarding_tasks
 ADD COLUMN IF NOT EXISTS employee_acknowledged_at timestamptz,
 ADD COLUMN IF NOT EXISTS employee_acknowledged_by uuid REFERENCES users(id);
ALTER TABLE onboarding_tasks
 ADD CONSTRAINT onboarding_acknowledgement_complete_pair CHECK (
  (employee_acknowledged_at IS NULL) = (employee_acknowledged_by IS NULL)
 );
COMMIT;
