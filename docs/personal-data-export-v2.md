# CABO personal data export, version 2

The personal export endpoint at `GET /api/v1/privacy/export` is authenticated and scoped to the current organization and user. If an HR employee record is verified as linked to the current account, the export now includes own leave history, finalized assessments, development plans, onboarding tasks, promotion/performance-review appeals, own submitted feedback and the employee-visible parts of progression follow-up events.

Information about other employees, unrelated candidate records and confidential internal HR investigation notes remains excluded by design. A reviewer must process a formal subject access request for additional lawfully disclosable information.

The export documents a maximum of 250 rows per collection. This is **not a complete historical archive** for very active accounts; it must not be advertised as comprehensive until paginated/archive export support is available. Downloaded exports contain personal information and should be stored securely by the recipient. Admin and employee access paths remain separate.

No employer is automatically compliant with POPIA simply because this feature exists. Subject identification, lawful exceptions, data correction, retention, timelines and external processor commitments require local organization policy and legal review.
