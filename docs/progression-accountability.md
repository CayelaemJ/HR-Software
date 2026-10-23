# Career progression and review accountability — first vertical slice

The progression-case workflow records evidence, links a performance review, and requires an authorized **human** decision with a written justification. It is not an automated promotion recommendation or salary calculator.

API under /api/v1/hr/progression (owner / HR administrator roles only):
- GET / — list authorized tenant's cases
- POST / — employeeId, optional reviewId, kind, evidenceSummary, requestedOutcome
- PATCH /:id/decision — status (under_review, approved, not_approved, closed), reason (at least 20 characters)

Every write is tenant-scoped and audited. The database enforces same-tenant employee and review references, records reviewer identity and prevents a final outcome without a reason.

**Still required:** a self-service submission and appeal channel; policy-driven promotion eligibility; separation of requester/decision-maker for conflicts of interest; calibrated, evidence-based human review panels; UI; notifications; final-status transition policy; retention/privacy evaluation and integration/E2E tests.

Do not use progression cases as proof of manager bias or automated entitlement to a pay rise. Employment decisions remain with authorized humans under applicable law.
