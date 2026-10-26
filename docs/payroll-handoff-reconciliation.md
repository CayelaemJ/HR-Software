# Two-person payroll handoff reconciliation — generic CSV, not Sage certification

The export remains a data-minimised, MFA-gated generic CSV for employee roster or approved leave, without salaries, banking information or medical notes. Every exported CSV has a tenant-isolated ledger record with an exact SHA-256 fingerprint.

An **independent HR administrator** who did not generate the file may record whether a receiving system reportedly accepted or rejected that exact export. They must confirm the original fingerprint, provide an external ticket/reference (12–250 characters) and evidence notes (15–1500 characters). Receipt is recorded once and cannot be silently overwritten. API access remains authorized to owner/HR admin accounts with MFA enabled; all decisions are audited.

An acknowledgement is **human-attested**. CABO has not connected to Sage, verified any vendor import API, or authenticated the external system's response. Reconciliation does not imply salary calculation, accurate entitlement, a payslip, statutory filing or successful payroll settlement.

Before certified vendor integration: identify the Sage product and API/version supported for each employer; obtain written vendor/controller authorization; implement least-privileged credentials, signed delivery acknowledgements, error reconciliation, idempotent retries, processing isolation and independent UAT/legal sign-off. This feature is a defensible manual fallback, not a substitute for those integrations.
