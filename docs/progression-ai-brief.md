# AI-assisted career progression evidence review

CABO Human Capital uses an optional Groq provider to create a **non-decisional** evidence brief for an independent HR reviewer. The feature accepts role-related case statements, recent finalized performance review summaries, and development plan evidence. It does not receive employee names, email addresses, demographic details, salary records or passwords, but free text may still contain personal information. Tenant administrators must obtain an appropriate lawful basis and review the provider's processing terms before use.

An HR administrator must explicitly confirm external processing for each request. The API audits the request by case, actor, model and confirmation, but does not store the generated draft. The returned JSON includes documented evidence, unresolved gaps, human-review questions and limitations. No approval/denial recommendation or scoring is intended. Provider unavailability does not block normal progression reviews.

Additional requirements before production: legal/POPIA review, consent/lawful-basis governance, free-text redaction, PII leak tests, model evaluation on South African performance contexts, protected-characteristic fairness tests, per-tenant budgets, fallback providers, and retention controls.
