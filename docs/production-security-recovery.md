# CABO Human Capital | Production security and recovery gates

**Status:** Engineering safeguards and disposable CI restore test exist. They are **not** a production POPIA, cybersecurity, backup-recovery or SLA certification. Public real-applicant intake remains disabled.

## Operating controls already implemented
- Browser requests that change state reject cross-site and same-site Fetch Metadata; mismatching `Origin` or `Referer` is rejected against the exact configured `CABO_PUBLIC_ORIGIN`. Native clients without browser headers continue to use authenticated cookies. This is an additional defence, not a substitute for SameSite, role authorization or device security.
- All API responses carry `Cache-Control: private, no-store`, `Pragma: no-cache` and `X-Robots-Tag: noindex, nofollow`. Helmet supplies baseline response security headers. UI static assets retain normal cache semantics.
- Production Postgres tenant-scoped transactions deliberately change to `cabo_runtime` with NOLOGIN/NOBYPASSRLS and verify this non-privileged role before using organization data.
- CVs are quarantined until scanned by a configured trusted private ClamAV service; documents not cleared cannot be downloaded/extracted. Expired candidate documents are physically purged from primary database storage. Backups may retain past bytes depending on provider policy.
- MFA protects platform-administrator functions and payroll export handoffs; employee and candidate decisions remain human supervised.

## Backups and recovery

### Tested in CI, on disposable synthetic data
1. Run all SQL migrations and synthetic tenant fixtures in a local `cabo_ci` database.
2. Generate a PostgreSQL *custom-format* logical archive with `pg_dump`.
3. Restore it to a separate disposable `cabo_ci_restore` database using `pg_restore`.
4. Compare migrated version count and sample table row counts; verify the restoration retains `FORCE ROW LEVEL SECURITY`.
5. Reprovision the test-only restricted role and assert it cannot read employee data without tenant context.
6. Delete the temporary archive and restored database.

The executable CI rehearsal **refuses** anything except `postgres@127.0.0.1/cabo_ci`. Never point it at production or run customer data through GitHub CI. No production backup files or personal records are sent to an AI model or exposed in logs.

### Production rehearsal still required
- Define an agreed recovery point objective and recovery time objective with CABO and the pilot organization; **no observed values may be claimed before a timed recovery drill**.
- Confirm Neon project plan, backup retention, point-in-time recovery features and access restrictions in Neon account settings. Document who may create, verify and delete restore branches.
- Perform a privileged, audited test restore into a separate restricted Neon test branch in its *private environment*, verify migrations, integrity, forced RLS, login and data deletion; collect start/end timestamps and sanitized evidence.
- Restrict backups and storage credentials; prevent accidental sharing of candidate and employee records. Verify provider backup retention and deletion obligations with a professional advisor.
- Write a reversible deployment procedure, incident escalation contacts, uptime and error alerting. Treat provider recovery functionality as unverified until actually exercised.

## Open release blockers
- The previously shared Neon database URL and Groq API key must be rotated; also confirm one-time bootstrap token is removed and session/MFA key rotation has a re-enrolment plan. Never paste replacement secrets into tickets or chat.
- Render currently follows an old feature branch; switch it to `main` in Render dashboard, confirm auto-deploy and a successful live build of a new main commit.
- Deploy a private malware scanner and confirm detection in an isolated environment; keep live uploads quarantined until then.
- Enable and require MFA for platform administrators before pilot handling of real client records; test user recovery safely.
- Review POPIA notices, lawful basis, processor agreements, data minimisation, objection/removal procedures, retention and international transfers with a South African legal/privacy professional. Test real user cancellation, export and deletion.
- Independent penetration testing, rate-limit resilience testing, accessibility/device testing, incident drills, pilot stakeholder approval and actual observed SLA measurement remain incomplete.

## Rollback and change checks
Only merge after green source CI. The Render service's health endpoint checks that a restricted database runtime role works. Recheck the active Render deploy commit, migration version, HTTPS and tenant isolation after each release. Add additive SQL migrations; never silently delete organization tables as a rollback strategy.

## Live applicant intake
`PUBLIC_APPLICATIONS_ENABLED=false` must remain in place until all applicant privacy, scanner and incident handling gates are approved. No automatic AI rejection, hiring or promotion is permitted.
