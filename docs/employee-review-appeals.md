# Employee performance review appeals

Linked employees can challenge their own finalized performance review without changing the original manager assessment. The employee writes an evidence summary and requested outcome. The API validates the authenticated employee-to-review relation under PostgreSQL tenant isolation, creates an independent performance_appeal progression case linked to the reviewed period, and audits its creation. Existing HR review queues can investigate the case; the subject employee or original case author cannot approve their own case.

Acknowledging receipt of a performance review never means agreement or waiver of appeal rights. The workflow limits requests to five per hour and blocks more than one pending/under-review appeal for the same review and employee. Closed cases may be followed up or reopened through a new request as policy permits.

No AI or automation decides merit, grants relief, changes salary, or edits finalized reviews.

Before commercial production: document company escalation policies, assign independent case handlers, define response SLAs, protect employees against retaliation, support attachments and independent evidence verification, add HR notifications, and complete South African labour/privacy legal review.
