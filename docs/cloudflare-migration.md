# CABO Human Capital — full application Cloudflare migration

## Correct scope
`CayelaemJ/HR-Software` contains an existing **Express/TypeScript API** and **React/Vite web app**. Both must be migrated as a single application; a static-only Pages preview is not a substitute for login, tenant-scoped recruitment, payroll, candidate documents or AI governance.

The earlier `cabo-human-capital-static` Pages project is strictly a non-production staging artifact. It does not deliver an authenticated application. **NewChanges is a separate project** and its Cloudflare primary migration is tracked in `CayelaemJ/NewChanges` PR #213.

## Full-stack candidate
- `Dockerfile.cloudflare`: Node 24 multi-stage build from the original root npm workspace, resulting in `apps/api/dist/server.js` plus `apps/web/dist/index.html`. No migrations or synthetic seeding on startup.
- `cloudflare/full-hr/worker.mjs`: Cloudflare Container running the original API and serving the built UI at the same origin.
- `wrangler.cabo-hr-full-stack.jsonc`: Workers subdomain disabled and all release flags off.
- `tests/cloudflare-full-hr.test.mjs`: fail-closed unit tests for auth, tenant RLS, document retention, MFA, rollback and host validation.
- Existing Express runtime only starts its privileged retention scheduler inside a Cloudflare Container once verified; otherwise it remains deliberately disabled to prevent duplicate purge jobs.

## Verified on isolated Node 24 environment
Root `npm ci`, `npm run build` (both API and web), the two gate unit tests, and Wrangler 4.155.0 Worker Container dry-run **passed**. These checks do **not** build or deploy a Docker image and do not establish that the Cloudflare plan allows Container deployment.

## Blocked before production
Database least-privilege/RLS, recruiter/employee login and MFA, resume/document retention and isolation, email/invitation handling, Groq provider quotas, upload validation, audit logs, CSRF/cookies/forwarded host, full synthetic role-based E2E, verified fallback and cost monitoring must all pass. Only then set the release flags and connect secrets through Cloudflare bindings. Don't reuse NewChanges or Learning Hub secrets.

**No production databases, Render services, DNS or customer records were touched.** The PR remains draft. Cloudflare is the intended primary destination for CABO HR, with Render retained as rollback until a real full-stack cutover.
