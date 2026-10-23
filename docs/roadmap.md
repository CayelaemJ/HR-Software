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
- [ ] Phase 5 AI: multi-provider processing, human review, evaluations, multilingual CV extraction and model governance.
- [ ] Phase 6 reporting: authorized exports, enterprise integrations including approved Sage APIs.
- [x] Browser app installation metadata: CABO-branded PWA manifest and responsive screen support (no offline sensitive-data caching).
- [x] Account security iteration: password change with session revocation, profile access and audited privacy request handling.
- [ ] Phase 7 native: Flutter Android/iOS/Windows/macOS builds and device validation.
- [x] Super-admin vertical slice: MFA-protected CABO Human Capital platform overview, tenant creation and membership-based tenant switching; tested in CI.
- [x] Critical database fix: transaction-level SET LOCAL ROLE with NOLOGIN/NOBYPASSRLS Neon role, fail-closed role check, runtime-aware health and cross-tenant API smoke tests.
- [ ] Phase 8 hardening: production threat modelling, specialist South African legal signoff, DR exercises, backups, privacy controls, observed SLA.

All features remain explicitly marked incomplete until integrated tests demonstrate their behavior. CABO AI never autonomously rejects or hires.
