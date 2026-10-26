# CABO Human Capital delivery roadmap

- [x] Phase 1 starter: monorepo, matching CABO palette, responsive web UI, session authentication, tenant-aware APIs, forced RLS SQL, SQL dashboards, audit, Render+Neon deployment definitions.
- [x] Explicit one-time synthetic demonstration tenant seed, UI labelling, and CI data checks.
- [x] MFA vertical slice: encrypted TOTP setup, one-time recovery codes, OTP/recovery login challenge and replay protection with unit tests.
- [ ] Phase 1 acceptance: run migrations against a real Neon branch, provision first tenant, verify Render deployment and HTTPS, cross-tenant integration tests, account lifecycle, password reset, MFA, CI pass.
- [x] Phase 2 vertical slice: tenant-isolated candidate evidence, human verification, interview scheduling, scorecards and PostgreSQL isolation checks.
- [x] Careers portal slice: public tenant-scoped published role listings, synthetic demo jobs excluded, consent-gated application endpoint disabled until privacy approval.
- [ ] Phase 2 recruitment: externally accessible careers page, genuine applications, secure CV storage, PDF/DOCX extraction, evidence maps, interview scorecards and recruiter collaboration.
- [x] Phase 3 vertical slice: organization-scoped employee directory, HR-only permissions, onboarding tasks, human-approved leave requests and audited changes.
- [x] Phase 4 vertical slice: evidence-based human performance reviews and individual development plans.
- [x] Phase 6 vertical slice: HR aggregate metrics, departmental counts and audited formula-safe employee CSV export.
- [ ] Phase 3 HR: onboarding, employee records, leave, documents, access segregation.
- [ ] Phase 4 performance: evidence-based reviews, professional development, progression and appeals.
- [x] Early AI integration: Groq-backed interview question drafting from job criteria, with human review and no automated candidate decisions.
- [x] Phase 5 governance slice: persist draft provenance, input fingerprint, tenant-private outputs and human approve/reject outcomes with audit.
- [ ] Phase 5 AI: multi-provider processing, model evaluations, multilingual CV extraction and comprehensive governance.
- [x] Phase 6 integration slice: MFA-gated and human-confirmed generic payroll CSV (employee roster or approved leave), audited SHA-256 metadata, scoped history and PostgreSQL integration tests.
- [ ] Phase 6 reporting: certified enterprise integrations including approved Sage APIs, payroll imports, schema validation and reconciliation.
- [x] Browser app installation metadata: CABO-branded PWA manifest and responsive screen support (no offline sensitive-data caching).
- [x] Account security iteration: password change with session revocation, profile access and audited privacy request handling.
- [ ] Phase 7 native: Flutter Android/iOS/Windows/macOS builds and device validation.
- [x] Super-admin vertical slice: MFA-protected CABO Human Capital platform overview, tenant creation and membership-based tenant switching; tested in CI.
- [x] Critical database fix: transaction-level SET LOCAL ROLE with NOLOGIN/NOBYPASSRLS Neon role, fail-closed role check, runtime-aware health and cross-tenant API smoke tests.
- [x] CV security lifecycle: quarantine-by-default, ClamAV INSTREAM optional private scanner, block extraction/download for unscanned files, expired CV physical purge with scoped retention audit and CI.
- [x] Phase 8 testable security slice: exact-origin browser protections, cross-site Fetch Metadata rejection, private API no-store policy, and disposable PostgreSQL dump/restore rehearsal with forced-RLS checks in CI.
- [x] Privacy portability: authenticated, tenant-scoped, auditable JSON export of own account and verified linked employee records, with no unlinked candidate disclosure.
- [ ] Phase 8 hardening: production threat modelling, specialist South African legal signoff, DR exercises, backups, privacy controls, observed SLA.

All features remain explicitly marked incomplete until integrated tests demonstrate their behavior. CABO AI never autonomously rejects or hires.

## Evidence-based progress update — 26 October 2026

- [x] CABO HR admin progression case workflow, independent written decision reasons and case audit history (#4, #6).
- [x] CABO progression case dashboard (#5).
- [x] Linked employee self-service (private finalized reviews, leave, onboarding tasks, development, promotion review) (#7, #10).
- [x] Human-reviewed, optional Groq progression evidence briefs (#8).
- [x] Delay monitoring for pending or unresolved cases; **not** a finding of discrimination (#9).
- [x] Native Flutter employee client source, test harness, unsigned platform builds and responsive CABO theme (#11 and native workflows). No retail app distribution claimed.
- [x] Authorized PDF/DOCX CV text extraction with quarantined file handling and source provenance (#13).
- [x] Cross-tenant/cookie CSRF hardening, Flutter same-origin writes and live Render proxy backport (#22, #24).
- [x] Optional evidence-only semantic CV analysis: job/application/document linkage, clean-file gate, source-grounded quoted passages, no candidate scoring or automated hiring (#25).
- [x] Reviewer conflict-of-interest checks for progression decisions, including linked subject accounts and matching work emails (#26).
- [x] External candidate CV AI processing disabled by default until processor and controller approvals (#27).
- [x] Employee ability to appeal their own finalized performance review with traceable evidence, independent review and duplicate-open-case prevention (#28).
- [x] Repository security engineering instructions and Dependabot configuration (#15).

### Remaining delivery and release gates

- [ ] Universal or multilingual CV interpretation: approved OCR for scanned documents, benchmark accuracy, candidate correction rights, provider fairness testing and independent evaluation.
- [ ] Corporate onboarding completion: verifiable offers/contracts, role-based approvals, IT provisioning integration and lifecycle notifications.
- [ ] Sage-specific verified integration contract (supported Sage product/version/API), reconciliation and authorized data handling. Existing generic approved payroll CSV is **not** a Sage replacement.
- [ ] Native store-ready binaries: device tests, accessibility, signing, store policy approvals, release automation and compatibility validation on affordable devices.
- [ ] Legal/commercial sign-off: POPIA and employment-equity processor and impact assessments, provider agreements, staffing policies, employment-law review and tenant-specific controls.
- [ ] Production release: verify current Render release branch versus main, database migrations on isolated staging, rollback, backups/restores, live smoke tests, monitoring and incident-response signoff.
- [ ] Continuous security: authenticated tenant-escape tests, DAST with staging approval, complete credential rotation and verified CircleCI scanner runs where configured.

### Deployment integrity

The Render service *cabo-human-capital* currently auto-deploys the separate branch `feat/phase1-render-neon-foundation`, not GitHub `main`. A successful merge into `main` **does not prove a feature is live on Render**. The latest verified Render deployment branch security backport (#24) is distinct from these feature merges. Do not change the production branch or claim a release without a migration/recovery validation and deployment smoke test.
