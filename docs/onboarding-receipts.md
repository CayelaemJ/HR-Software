# Employee onboarding receipt and HR completion separation

Employees with linked and authenticated organization accounts can acknowledge **receipt** of their own onboarding tasks. The receipt records an employee identity and UTC timestamp without completing or waiving the task, changing the employee's legal position, or confirming policy agreement. Only an authorized HR administrator may mark a task completed or waived, with a separate human justification and audit event.

The employee route enforces same-tenant lookup, employee-to-account ownership and one-time acknowledgement in a single transaction. Other employees and other tenants cannot acknowledge the task. The HR task list displays receipt timestamps separately from actual completion. SQL migration 016 adds the receipt fields and pair constraint.

Not implemented: policy-signature acceptance, document version and acceptance proof, contract signing, automated identity checks, independent verification of training completion, workflow notifications, onboarding emails or vendor IT provisioning. These remain release gates and must not be represented as complete.

Tests cover permission boundaries, replay, cross-tenant denial, HR role separation and audit. Production rollout still requires staging migration rehearsal, incident and privacy review.
