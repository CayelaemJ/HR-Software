# HR progression follow-ups, escalation evidence and employee-visible updates

Human Capital administrators can record evidence-backed follow-up actions on open progression cases (review started, evidence requested, escalation or an upcoming action). Each follow-up is an immutable entry that includes an internal reason, human actor, timestamp, optional next-action date, and optional separately written employee-visible progress summary.

Only an independent HR owner/administrator may create a case follow-up. The case author, subject employee and employee with a matching work email cannot record one. The case must remain pending or under review, and creating a follow-up never changes its outcome or determines pay or promotions.

The employee's authenticated personal workspace shows only intentionally public summaries for their own cases. Internal HR reasons and reviewer identities are not exposed to employees through this view. The DB enforces tenant foreign keys and RLS. Automated tests cover independent roles, cross-tenant denial, audit records, non-decisional state preservation and employee disclosure minimization.

Limitations: This does not send external notifications, enforce legally binding SLAs, independently verify the truth of notes, or prove managerial misconduct. It provides a documented investigation trail, not a bias verdict. Reviewers must follow approved employee privacy and grievance procedures before acting.
