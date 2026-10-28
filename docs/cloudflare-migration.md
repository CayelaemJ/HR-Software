# CABO Human Capital - Cloudflare Direct Upload migration

## Current state
This is a **build-only and security-review** branch. The Cloudflare account has a Direct Upload Pages project named `cabo-human-capital-static`; it does not require the broken Cloudflare GitHub App integration. This repository change does **not** deploy or change production traffic.

The static build pipeline produces `apps/web/dist` using:

```sh
npm install --no-audit --no-fund
npm run build --workspace @cabo/web
test -s apps/web/dist/index.html
```

After functionality, authentication and privacy checks pass, a reviewer can deploy via Wrangler with a narrowly scoped `CLOUDFLARE_API_TOKEN` configured as a secret:

```sh
npx wrangler@4 pages deploy apps/web/dist --project-name=cabo-human-capital-static --branch=main
```

## What must be migrated, not bypassed
The API provides authentication, hiring decisions and applicant data. Do NOT publish an independently accessible frontend until account login, role checks, applicant data protection, session and API origin rules work.

Use a fixed and controlled API upstream if transitional. Never put credentials or arbitrary origin URLs in client JS. Protect sessions, cross-origin cookies and OAuth callbacks against the Cloudflare hostname.

## No cutover
- Render remains the canonical runtime and rollback target.
- Database, storage, OAuth, email and payments stay in their currently functioning services.
- Do not claim a full migration from a static frontend build alone.
- Do not merge or change DNS until CI, synthetic demo flows, unauthorized access and release checks pass.
- **NewChanges is out of scope and stays on Render.**
