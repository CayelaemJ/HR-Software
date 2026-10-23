# HR process fairness monitoring

The authorized HR dashboard shows configurable-in-the-future **workflow-delay signals** based on objective timestamps: progression cases pending for over 30 days, under review for over 14 days, and submitted performance reviews unresolved for over 30 days. Cases remain tenant-isolated through PostgreSQL RLS and HR-only APIs.

These threshold flags are not a determination of manager misconduct, discrimination, promotion entitlement, or performance quality. HR must investigate workload, leave, missing evidence, and policies before acting. All threshold values are displayed to reviewers; no staff member is automatically penalized.

Next requirements include employee-visible escalation rights, safe configurable SLAs by organization, tracked remediation actions, approved pay-equity analytics with minimum group sizes, appeal assignment, notifications, fairness evaluations, privacy impact assessment, and full browser tests.
