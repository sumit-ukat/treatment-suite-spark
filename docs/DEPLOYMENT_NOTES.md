# Deployment Notes

**Current position: local only.** Per the instruction of 2026-07-31, nothing is deployed. No cloud
Supabase project is created. This document records the constraints so that no dependency is added now
that would limit the choice later.

---

## Hard constraints

| Constraint | Consequence |
|---|---|
| **No Vercel** | No `@vercel/*` packages, no Vercel-specific runtime APIs, no `vercel.json`, no Edge-Runtime-only code |
| Portable build | Nitro's generic Node preset → a self-contained Node server |
| Hosting undecided (Q31) | No host-specific storage, cron, KV, image-optimisation or middleware APIs |
| Data residency assumed UK/EU (Q31) | The Supabase region is fixed **at project creation** and cannot be changed afterwards without a migration — so the project must not be created before this is confirmed |

**Note on the existing repository:** it contains a `.vercel` directory (git-ignored) from the current
pricing product, and a Vercel MCP connector is available in this environment. Neither is used for this
platform. If Q1 resolves to a separate repository, the new one starts without them.

## Build

```bash
npm run build
```

```bash
node dist/server/index.mjs
```

The output is a self-contained Node server — deployable to Render, Fly.io, Railway, a VPS, or
on-premise infrastructure. Nothing about the build assumes a platform.

## Environment variables

| Variable | Scope | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | **Browser** | Compiled into the bundle |
| `VITE_SUPABASE_ANON_KEY` | **Browser** | Safe only because RLS is correct |
| `SUPABASE_URL` | Server | |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | Bypasses RLS. Never `VITE_`-prefixed. Never in client code |
| `NODE_ENV` | Server | |
| `APP_BASE_URL` | Server | For signed-URL and auth redirects |

Anything prefixed `VITE_` ends up in the browser bundle. Treat that prefix as a publication decision.

## Requirements of any candidate host

- Node 20+, long-running process (not function-per-request — signed-URL minting and transactional
  workflow functions assume a normal server)
- HTTPS with HSTS
- Secret storage that is not the filesystem or the repository
- UK/EU region, matching the Supabase region (pending Q31)
- Log retention that **excludes** request bodies, since those carry client data

## Pre-production checklist

- [ ] Hosting platform approved (Q31)
- [ ] Data residency confirmed **before** the Supabase project is created
- [ ] Production Supabase project, separate from any development project
- [ ] `service_role` key stored only in the host's secret store; verified absent from client bundles
- [ ] All migrations applied; types regenerated
- [ ] RLS enabled **and forced** on every table (asserted in CI)
- [ ] `client-photos` bucket confirmed private
- [ ] MFA enforced; session timeout set (Q30)
- [ ] Backups configured **and a restore drill actually performed** — an untested backup is a
      hypothesis, not a control
- [ ] Retention policy implemented (Q29)
- [ ] Log scrubbing verified (no level-3 content)
- [ ] Penetration test complete
- [ ] DPIA complete; information-governance sign-off (Q33)
- [ ] Confirmation that no real client data reached a non-production environment
- [ ] Incident-response runbook, including the 72-hour ICO notification path

## Backup expectations (to confirm)

Supabase provides automated backups on paid plans; the frequency, retention and point-in-time-recovery
window depend on the plan and must be matched to the organisation's requirements (Q29). Storage
objects — the client photographs — need a **separate** backup consideration: database backups do not
cover bucket contents.

Restore must be tested, and the test must include storage.
