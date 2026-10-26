# CABO Human Capital — production release evidence checklist

This checklist separates code completion, test evidence, customer authorization, and actual deployment. It is a release gate, not a claim of certification.

## Product readiness

- [ ] Test the vacancy → candidate → CV upload → safe parsing → human decision → offer → onboarding → review → appeal journey in a real browser and on representative mobile/desktop devices.
- [ ] Validate role permissions and tenant isolation for recruitment agencies, employees, HR departments and company administrators.
- [ ] Confirm all screens preserve CABO design tokens, accessibility and clear uncertainty/empty/error states.
- [ ] Verify document uploads are malware-scanned and human-readable accessible alternatives are supported.

## AI and fairness

- [ ] Complete written AI purpose limitation and processor assessment for each customer and supported country.
- [ ] Validate actual AI extraction and semantic matching across CV layouts, scanned files, languages, career gaps and nontraditional experience.
- [ ] Publish human-review criteria and correction/appeal procedures. No automated hiring, dismissal, raise or promotion decisions.
- [ ] Test disparate extraction error and review outcomes where lawful and privacy-safe. Review all observed differences with qualified personnel.
- [ ] Only enable HR_CV_AI_EXTERNAL_ENABLED after formal authorization and transfer controls.

## Integrations

- [ ] Obtain approval for the exact Sage product, version and API permissions; use supported interfaces only.
- [ ] Reconcile outgoing HR/payroll handoff against destination acknowledgements and maintain immutable processing/audit metadata.
- [ ] Verify no duplicate processing on retries and enforce data-minimized exports.

## Cybersecurity and reliability

- [ ] Deploy a least-privilege PostgreSQL runtime role with forced RLS; execute cross-tenant negative tests on staging.
- [ ] Confirm SSRF, CSRF, upload, IDOR, MFA, rate-limit and object-level access controls in both browser and native clients.
- [ ] Restore an encrypted backup into an isolated environment and compare business-critical records.
- [ ] Validate secrets are held in Render/Neon providers, not repository, logs, build outputs, or demo content.
- [ ] Use an approved, isolated DAST target. Never run active penetration tests against production without authorization.

## Regulatory and organizational approval

- [ ] Obtain POPIA / PAIA counsel review, including privacy notice, records retention, data-subject requests and cross-border processor data flow.
- [ ] Validate applicable South African employment and Employment Equity Act requirements with qualified reviewers.
- [ ] Document independent employee review ownership, escalation policies, nonretaliation safeguards and response timelines.
- [ ] Document incident-response roles, breach notification obligations and audit retention.

## Deployment evidence

- [ ] Confirm that the intended GitHub main commit corresponds to the Render deployment commit and the correct database schema.
- [ ] Complete staging migration rehearsal, release candidate CI/CD, rollback tests, monitored rollout and post-deploy smoke checks.
- [ ] Confirm signed distributables and actual device support before advertising Android/iOS/Windows/macOS availability.
- [ ] Record a dated sign-off with responsible owner and evidence links for each checklist item.

The deployment branch is currently separate from main. Code-level CI success is not evidence of deployment or legal compliance.
