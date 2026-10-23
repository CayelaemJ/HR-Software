# CABO Human Capital — Phase 1 Foundation

South Africa-first, evidence-led recruitment and human capital platform using CABO brand colours from [CABOSOLUTIONS](https://github.com/CayelaemJ/CABOSOLUTIONS/blob/main/src/styles/theme.css).

## Working scope
Organization registration, tenant-scoped login/session management, vacancy records, recruiter-entered candidate applications, and real PostgreSQL-backed dashboards. UI is responsive and accessible at a basic level. This is **not** a completed HR product or a compliance-certified system.

## Local setup
Node.js 22+ and PostgreSQL 15+ required.

1. `npm install`
2. Set `DATABASE_URL` and `APP_ORIGIN=http://localhost:3000` using `.env.example` as a guide (Node does not auto-load .env; use `node --env-file=.env server.mjs`).
3. Apply `db/001_init.sql` and `db/002_session_lookup.sql` in order, using a trusted migration role.
4. Grant EXECUTE on `auth_session_tenant(text)` to the runtime DB role; **do not use a superuser or BYPASSRLS role at runtime**. The migration owner must be distinct from the runtime role so the security-definer lookup can access session rows.
5. Run `npm start`, open `http://localhost:3000`.
6. Run `npm test`.

## Security & current gaps
All member/vacancy/application queries are tenant scoped with PostgreSQL RLS; session-token tenant lookup uses a dedicated SECURITY DEFINER function returning only the tenant UUID. The runtime role must not own/bypass the policies. Sessions are opaque and expire after 12 hours. Origin checks, SameSite cookies, input validation and basic process-local rate limiting are included.

**Not production ready:** no email verification or password reset, no MFA or invitation workflow, no audit log, no scalable distributed rate limiting, no production role provisioning scripts, no employee onboarding, no CV parsing/AI, no secure document ingestion, no independent external security audit, and no migration CI. Do not process real candidate personal information until appropriate controls, POPIA review, retention policies, backup/restore testing and deployment hardening are completed.

Next steps: production database role provisioning and integration tests; invitations and employee permissions; immutable audit events; documented recruitment scoring and human review; secure CV uploads and extraction; onboarding and performance modules; native mobile/desktop clients.
