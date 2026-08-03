# Supabase Setup

**Local-first.** Per the instruction of 2026-07-31, everything runs on a local Supabase stack. No
cloud project is created and nothing is deployed until hosting is agreed (Q31).

**Blocked on Q1** — whether this lives in a new repository with its own Supabase project (recommended)
or extends the existing one. The commands below assume a dedicated project directory.

---

## Prerequisites

- Node 20+ and npm
- Docker Desktop (required by the Supabase local stack)
- Supabase CLI — `npm i -g supabase` or `scoop install supabase`

## Local stack

```bash
supabase init
```

```bash
supabase start
```

`supabase start` prints the local API URL, Studio URL, `anon` key and `service_role` key. Studio runs
at http://localhost:54323 and the database at `postgresql://postgres:postgres@localhost:54322/postgres`.

```bash
supabase db reset
```

Reruns every migration from scratch and applies `seed.sql`. This is the main development loop — the
schema is rebuilt from migrations, never edited by hand in Studio.

## Environment

`.env.local` (git-ignored — see [SECURITY_MODEL.md](SECURITY_MODEL.md)):

```bash
# Client-visible. Safe only because RLS is correct.
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<anon key from supabase start>

# SERVER ONLY — bypasses RLS entirely. Never prefix with VITE_.
SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase start>
SUPABASE_URL=http://127.0.0.1:54321
```

Any variable prefixed `VITE_` is **compiled into the browser bundle**. The `service_role` key must
never carry that prefix, and a build check should fail if it appears in client output.

## Migration order (planned)

| # | Migration | Contents |
|---|---|---|
| 0001 | `extensions` | `pgcrypto`, `btree_gist` (needed for the bed exclusion constraint) |
| 0002 | `org_hierarchy` | organisations, zones, centres, rooms, beds |
| 0003 | `identity_access` | users, roles, permissions, role_permissions, user_access_assignments |
| 0004 | `access_helpers` | `app.accessible_centre_ids()`, `app.has_permission()` |
| 0005 | `clients_admissions` | clients, client_photos, admissions, substances, staff_assignments, peep_records |
| 0006 | `allocations` | room_allocations + GiST exclusion constraint + cross-centre FK |
| 0007 | `tasks` | task_templates, client_tasks, task_assignments, overdue view |
| 0008 | `treatment_records` | family_contacts, family_meetings, treatment_milestones, detox_records |
| 0009 | `medical_risk` | medical_review_requests, safeguarding_records, risk_records, notes |
| 0010 | `discharge_escalation` | discharge_records, escalations |
| 0011 | `audit` | audit_events, append-only grants + trigger, per-table audit triggers |
| 0012 | `rls_policies` | RLS enabled and policies for every table |
| 0013 | `business_rule_functions` | admission, allocation, discharge-change, early-discharge, eligibility |
| 0014 | `import` | import_jobs, import_source_values |
| 0015 | `seed_reference_data` | roles, permissions, role_permissions, task templates, substances |

Rule: **RLS is enabled in the same migration that creates the table.** A table that exists for even
one migration without RLS is a table someone will forget.

```sql
ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <t> FORCE ROW LEVEL SECURITY;  -- applies to the table owner too
```

## Storage

One **private** bucket, `client-photos`. Created in a migration, never through the dashboard, so
environments cannot drift:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('client-photos', 'client-photos', false, 5242880,
        ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;
```

`public = false` is non-negotiable. Access is only via server-minted signed URLs (≤ 60 s) after a
permission check, with storage policies mirroring centre scope.

## Seed data

`supabase/seed.sql` — **fictional only**:

- one organisation, one zone, Primrose Lodge
- 16 rooms / 18 beds matching the real configuration (labels are not personal data)
- roles, permissions and role_permissions
- task templates derived from the workbook columns
- ~8 fictional clients with generated names and no photographs
- one user per role for permission testing

**Never** the real workbook, real names or real photographs. See
[SECURITY_MODEL.md](SECURITY_MODEL.md) §7.

## Types

```bash
supabase gen types typescript --local > src/lib/database.types.ts
```

Regenerate after every migration and commit the result.

## Cloud (deferred)

When a project is eventually created, the **region must be UK or EU** and is chosen at creation —
it cannot be changed afterwards without a full migration (Q31). Do not create a cloud project before
that is confirmed.
