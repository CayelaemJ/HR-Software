# Independent HR approvals and self-interest controls

The system refuses HR leave decisions when the deciding user created that leave request or is the employee concerned. Employee identity is verified using both the explicit employee-account link and a work-email match. Independent approval requires an authorized HR owner or administrator.

Finalizing a performance review requires a different HR decision maker from the original review author/reviewer and from the employee whose review it is. Moving a review from draft to submitted does not decide the outcome; finalizing it is a distinct accountable decision.

The checks run within tenant-scoped PostgreSQL statements, followed by audit writes in the same transaction. A denied decision does not change the underlying record. Automated tests exercise subject, request creator, review author and independent decision-maker identities.

**Remaining:** manager/supervisor reporting-line conflicts, a reviewer assignment and declaration process, escalation if the organization has only one HR reviewer, employee notifications and legally reviewed organizational decision policies. This is not a pay raise, payroll, disciplinary action or discrimination finding.
