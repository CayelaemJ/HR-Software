# Employee withdrawal of pending leave

Authenticated employees linked to an employee record may withdraw only their own pending leave requests. The server validates their account-to-employee link and uses a tenant-scoped atomic update. A withdrawal is recorded as cancelled, with an audit entry and the acting user. A request already approved, rejected, withdrawn or belonging to another employee cannot be withdrawn using this endpoint.

The employee portal offers a confirmation action only for pending requests. HR personnel continue to make all approvals or rejections; the employee cannot approve their own leave. No leave balances or salary calculations are performed.

Further work: organization-specific cancellation policies, notification delivery, legal leave entitlements, accrual calculation, approved-leave amendment workflows, and verified Sage integration. These are not automated.
