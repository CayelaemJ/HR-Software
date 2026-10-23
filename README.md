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
- Idempotent SQL migration runner, Render deployment blueprint, automated static/unit checks

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
