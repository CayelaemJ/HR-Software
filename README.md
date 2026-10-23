# CABO Human Capital

Evidence-led recruitment and people development for South Africa, by CABO Solutions.

**Stack:** React + TypeScript web, Express + TypeScript API, Neon PostgreSQL, Render. **Status:** Phase 1 implementation branch; not yet approved for production HR data.

## What is actually implemented
- CABO-coloured responsive light/dark web interface with login and authenticated navigation
- Tenant membership-based access control with forced PostgreSQL RLS on tenant data
- Vacancy draft/publish/close, candidate directory and application-stage tracking
- Required human-supplied reasons for hiring or rejection outcomes
- Candidate claim provenance, manual verification evidence and disputed-claim statuses
- Structured interview schedules, human scorecards and audit entries
- SQL-backed dashboard counters and a database audit history
- Owner-approved, one-time synthetic demo data loader with clearly labelled examples
- Idempotent SQL migration runner, Render deployment blueprint, automated static/unit checks

The owner may click **Load demo data** on the dashboard to create labelled synthetic sample vacancies, applications, claim evidence and an interview. This is **explicitly opt-in** and cannot run twice for the same tenant. Never mistake these records for genuine candidates.

## Run locally
Requires Node 22+, PostgreSQL 15+ and an empty database.
1. `npm install`
2. Copy `.env.example` to `.env`, configure `DATABASE_URL` and a random 32+ character `SESSION_SECRET`. Load variables in your shell (e.g. `set -a; source .env; set +a`) because the API intentionally does not load env files automatically.
3. `npm run build`
4. `npm run db:migrate`
5. `npm start` (app at http://localhost:3000); or `npm run dev:api` plus `npm run dev:web` for hot reloading.
6. To create the first organization, configure a random 24+ character `BOOTSTRAP_TOKEN` and run:
   ```sh
   curl -X POST http://localhost:3000/api/v1/setup \
     -H 'Content-Type: application/json' -H "x-setup-token: $BOOTSTRAP_TOKEN" \
     -d '{"organization":"CABO Demo","name":"Demo Administrator","email":"admin@example.test","password":"REPLACE_WITH_STRONG_PRIVATE_PASSWORD"}'
   ```
   Remove `BOOTSTRAP_TOKEN` after it succeeds. The setup endpoint permits only one successful provisioning per database.
7. Sign in with the owner email and password. All data starts empty by design: no synthetic stats are presented as real.

## Deploy: Render + Neon
1. Create a **Neon** project and copy its pooled PostgreSQL connection string (TLS required). Prefer separate development and production branches/databases and a least-privilege app role without `BYPASSRLS`.
2. In **Render**, connect the GitHub repository and deploy a Node web service; the `render.yaml` Blueprint provides defaults. Build: `npm install && npm run build`. Start: `npm run db:migrate && npm start`. Use `/health` as the health check.
3. Set Render secrets `DATABASE_URL` (Neon), `SESSION_SECRET` (unique 32+ characters), `NODE_ENV=production`, and a temporary `BOOTSTRAP_TOKEN` (24+ characters). Never put secrets in GitHub commits.
4. Once the live health endpoint reports a connected database, complete the one-time setup via an authorized HTTPS request with the setup token. Remove `BOOTSTRAP_TOKEN` from Render immediately afterward.
5. Validate login, creating a vacancy, publishing, creating a candidate, opening an application, moving it to interview, and reviewing audit events. Confirm CI passing before merging the development PR.

**Deployment and database availability have not been verified yet.** Do not claim the system is live until Render reports a successful deploy and the live Neon health check passes.

## Security and regulatory posture
All records are created by users and stored in Neon; the UI never fabricates live dashboard numbers. Login requires a signed, expiring HttpOnly cookie and verified membership. SQL row-level security is database-enforced. The application is not yet suitable for storing real candidate or employee personal data without further testing, POPIA/Section 71 review, safeguards and penetration testing.

**Phase 2 note:** Candidate evidence currently consists of manually recorded statements and excerpts, not uploaded CV processing. This must not be represented as independent verification. Interview scheduling records timing but does not email calendar invitations yet.

Detailed implementation: [Architecture](docs/architecture.md), [Roadmap](docs/roadmap.md).

## License
Proprietary — CABO Solutions. No rights granted without written permission.

## Human Capital operations (new)

The **HR & performance** workspace is visible only to the organization owner and Human Resources administrators. It includes employee records, checklisted onboarding, recorded leave approvals, evidence-based performance reviews, development plans and auditable aggregate reports with authorized CSV export.

This is a functional vertical slice, **not a complete payroll or South African employment-law compliance suite**. Leave accrual, labor-law calculations, sick-note uploads, employee self-service, appeals workflows, Sage integrations, password reset, MFA, mobile binaries and formal POPIA assessment are still future work. A Human Resources professional must review decisions. Sensitive data must not be entered before a privacy assessment and role-based access review.

The existing `cabo_test` login has `owner` privileges for the CABO demonstration organization only. No credentials or plaintext passwords are stored in source.

## Account and privacy controls

The **Privacy & access** workspace permits account profile access, manual access/export/correction/erasure/objection requests, and administrator responses. A successful password change increments the database session version, invalidates existing signed sessions and requires another login. No request auto-erases recruitment or employee records; legitimate retention obligations and identity verification still need a privacy-officer workflow.

Browser app installation metadata is included for capable browsers. This is **not** a native Android/iOS/desktop binary and does **not** cache private HR content for offline use. Full POPIA readiness and multifactor authentication remain outstanding.

## External careers / candidate applications

Read-only shareable careers pages are available at `/careers/{organization-tenant-uuid}`. Only published non-demo jobs appear.

Candidate self-application is implemented but **disabled by default**. A responsible CABO operator must approve privacy notices, retention terms, incident handling, applicant rights and anti-abuse protections before setting `PUBLIC_APPLICATIONS_ENABLED=true` in Render. Until then the portal visibly says applications are not open and the API returns 503 without accepting applicant data. **Do not enable public submissions for genuine candidates until that launch checklist is completed.**

## Authenticator sign-in

Under **Privacy & access**, each account can enroll an authenticator with its current password, verify a six-digit code, and receive single-use recovery codes. Codes are displayed only when enrollment completes. After enabling or disabling MFA, existing login sessions are revoked. MFA secrets are AES-256-GCM encrypted using a key derived for this purpose from the Render session secret. A session-secret rotation will require an MFA migration/re-enrollment plan.

**Important:** MFA is opt-in, not mandated for all organization admins yet. Organization-managed recovery, enforced MFA, user invitations, and independent security review are not complete.

## CABO platform owner administration
A separately authorized **platform_administrators** table records individuals who may access cross-organization metadata. The **Platform admin** workspace requires both an existing platform-administrator grant and enabled authenticator MFA. It displays **only aggregate** per-tenant counts and enables explicit provisioning of new, separate tenant organizations. Each newly provisioned tenant grants its creator owner access to that new tenant; there is **no automatic access to existing client organizations**.

Users can switch between organizations only if they already belong to both. The regular recruitment and HR APIs retain their tenant-specific row-level security contexts. Platform privileges are granted only by an authorized database administrator, never through self-service registration or an API.

This scope is exclusively **CABO Human Capital**; it does not automatically provision administrators in CABO Commerce, Learning Hub, or any other product. A review of privileged actions, organization offboarding, compulsory MFA, and independent audit trails remains to be completed.

## Tenant isolation operational requirement (critical)
Neon's database owner role has `BYPASSRLS`. Connecting to tenant tables as that role without dropping privileges can leak information between organizations. To prevent this, each `inTenant` and `forUser` transaction now executes `SET LOCAL ROLE cabo_runtime`, validates that the current role is neither superuser nor BYPASSRLS, and only then runs tenant-scoped SQL. If the role is absent, invalid or lacks grants, tenant requests **fail closed**. The `/health` endpoint checks tenant-scoped runtime access, not merely database owner connectivity.

On a new Neon project, apply `db/ops/provision-runtime.sql` as the project migration owner before starting the web service. The operational role is NOLOGIN and cannot be used to bypass database row-level security. Grants and default grants cover the migration-owned tables and sequences. This is critical for the CABO multi-tenant model.

The migration owner is still used for database migrations and explicitly privileged platform-level aggregate administration. Cross-tenant aggregation is isolated behind separately authorized, MFA-required platform endpoints. Long-term: use separate credentials for migrations versus application runtime so the process never holds a privileged owner connection.


## CV quarantine, malware scanning and retention (pilot security phase)

Every existing and new CV now has a mandatory **scan status**. Existing records are migrated to `pending`, never assumed safe. The browser cannot download or extract documents until status is `clean`; quarantined files can still be deleted. When a private ClamAV instance is configured, the server scans new uploads through CLAMD's INSTREAM protocol; detected malicious uploads are rejected without storage. An authorized recruiter may re-scan quarantined documents through the CV panel.

To connect an AV service in Render, provision a trusted **private-network** ClamAV service that listens on TCP port 3310, and set `CLAMAV_HOST` and optionally `CLAMAV_PORT`. Supported hosts are local loopback, RFC1918 addresses, or private `.internal`, `.svc`, `.local` DNS names. **Never put the scanner on a public interface or transmit candidate information to a third party without a reviewed agreement.** If the scanner is missing, unreachable or returns an unexpected result, the document remains quarantined; the API fails closed. A `clean` result cannot guarantee a file is harmless and is not proof a candidate's qualifications are genuine.

Expired CV bytes are physically deleted in bounded maintenance passes on API boot and approximately every six hours, with tenant-scoped count-only retention logs in Neon. Retention applies to `expires_at` (initially 180 days after upload). This pilot currently has no court/legal-hold workflow, no malware signature version attestation, and no validated disaster-recovery deletion across third-party backups. Do not open real applicant data collection until POPIA/retention/incident handling, scanner availability, CV storage policy and human-review safeguards are approved.
