# Fair employee feedback, corrections and independent HR acknowledgement

A linked employee can submit a review comment, a record-correction request, or development feedback directly through their authenticated workspace. The original message, actor and timestamp are retained in the tenant-isolated employee_feedback table. The employee can view their own submissions and acknowledgement status without accessing any other employee's records.

Only an authorized HR owner or administrator can read the organization feedback queue and acknowledge receipt. An employee cannot acknowledge their own feedback even if they also hold HR permissions. Every submission and HR acknowledgement is audited, rate limited and kept separate from payroll, promotion, contract and performance-review decisions.

**Receipt is not resolution or agreement.** Further adjudication, corrected source records, independent reviewer assignment, anti-retaliation protections, notification service and formal appeal outcomes are not part of this incremental slice. If the feedback concerns a consequential employment decision, the separate independent review and appeal workflow must be used. POPIA and labour-law policies should be reviewed before live employee use.
