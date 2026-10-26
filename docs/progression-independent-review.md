# Independent progression review conflict-of-interest safeguard

The progression decision API now refuses approval or review-state changes when the decision-maker is the case author **or** is the subject employee. Subject identity is checked against both linked employee accounts and the employee's work email, so lack of an employee-account link cannot bypass the safeguard.

The check is enforced inside the same tenant-scoped PostgreSQL transaction that records the human decision. Audited test cases demonstrate that a self-interested reviewer receives HTTP 409 and a separate authorized HR reviewer can proceed.

**Limits:** This is not a full conflict-of-interest engine. Managers, family members and reporting-line conflicts still require declaration and an independently appointed review panel; business policy must define approval authority. No automatic pay increase or promotion follows a case status change. High-stakes cases should undergo legal, privacy, and fairness review.
