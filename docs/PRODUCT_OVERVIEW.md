# Product Overview

**Working name:** Treatment Operations Platform
**First centre:** Primrose Lodge (16 rooms / 18 bed spaces)
**Status:** Phase 0 — discovery complete, no application code written

---

## What this replaces

A single-sheet spreadsheet ("the whiteboard") with 34 columns and one row per bed. It works, and it
is genuinely readable at a glance — but it cannot record *when* something was due versus *when* it
was done, *who* was responsible, or *what a value used to be*. A client disappears from it the moment
they are discharged. Anyone who can see the room list can also read the safeguarding notes.

See [WORKBOOK_REVIEW.md](WORKBOOK_REVIEW.md) §10 for the eight structural limits driving this build.

## What it is

A multi-centre client-journey and operational-accountability platform, in two connected layers:

1. **The client file** — the source of truth. One electronic record per client, with a separate
   record per admission episode.
2. **Dashboards** — live projections of those files. Occupancy, work due, work overdue, ownership,
   upcoming discharges, restricted-alert counts. Nothing is stored twice.

It answers, for an authorised user and only within their scope: *who is here, where, who is
responsible, what is due, what is late, who owns it, what has changed, and who changed it.*

## What it is not

- Not a clinical decision-making or risk-scoring system. It schedules, records and evidences —
  it does not advise. This is a permanent boundary, not a v1 limitation.
- Not an electronic patient record or prescribing system.
- Not "CQC compliant". It **supports auditability, evidence gathering and internal governance**.
  Formal compliance is assessed by the organisation, separately.
- Not a spreadsheet with a nicer front end.

## Design commitments

| Commitment | Consequence |
|---|---|
| Client file is the source of truth | Dashboards are views; no duplicated state |
| Client ≠ admission | Returning clients keep separate, intact histories |
| Bed is the allocatable unit | Shared rooms (6A/6B) work natively |
| Due ≠ done | Lateness is measurable; the workbook's central defect is designed out |
| Append-only history | Allocations, task events and audit rows are added, never edited away |
| Deny by default | No access assignment means no rows, at every layer |
| Nothing hard-coded | Centres, rooms, task schedules and permissions are data — a second centre is configuration, not a release |
| Sensitivity is explicit | Level 1–4 on the record; RLS reads it |

## Multi-centre from the start

`organisation → zone → centre → room → bed → client → admission → tasks`.

Primrose Lodge is the **first row**, not the shape of the product. Its 18 beds, its 28-day default
duration and its task schedule are all data. A second centre with different rooms, staff, task
templates and doctor-review day is added through administration screens.

Users are scoped by explicit assignment at organisation, zone or centre level; a user may hold
several roles across several centres, optionally read-only and optionally time-limited. Regional
oversight is a zone-scoped assignment — **no person's access is named in code**.

## Sensitivity levels

| Level | Contains | Seen by |
|---|---|---|
| 1 Operational | Name/reference, room, dates, therapist, task title, owner, status | Most roles in scope |
| 2 Treatment coordination | Milestones, family-work status, group, approved treatment notes | Clinical + management roles |
| 3 Sensitive | Detox, medical detail, safeguarding and risk narratives, therapy notes | Explicitly permitted roles only |
| 4 Admin & security | Permissions, auth events, audit, configuration | Administrators; clinical read not implied |

Level-3 records expose their *existence and severity* at level 1, so a dashboard can show
*"⚠ Restricted alert — contact centre manager"* without leaking the narrative.

## Technology

| Layer | Choice | Note |
|---|---|---|
| Database | Supabase PostgreSQL | RLS on every sensitive table |
| Auth | Supabase Auth | Pending Q30 — SSO strongly preferred |
| Storage | Supabase Storage, **private** buckets | Signed URLs only |
| Backend logic | Postgres functions + server functions | Never client-side |
| Frontend | TypeScript, React 19, TanStack Start, Tailwind | strict mode |
| Build/host | Nitro → any Node host | **Vercel excluded**; no Vercel-specific APIs |
| Design | Lovable may inform layouts | Generated code is reviewed, never authoritative |

Everything runs **locally** for now — Supabase CLI local stack, `npm run dev`. Hosting is decided
later (Q31), and no dependency may assume a particular host.

## Phase status

| Phase | Status |
|---|---|
| 0 · Discovery & workbook analysis | ✅ **complete** |
| 1 · Project foundation | ⬜ blocked on Q1 (repository) |
| 2 · Organisation, centres, rooms | ⬜ |
| 3 · Clients & admissions | ⬜ |
| 4 · Tasks | ⬜ |
| 5 · Family & treatment workflows | ⬜ |
| 6 · Discharge | ⬜ |
| 7 · Oversight dashboards | ⬜ |
| 8 · Workbook import | ⬜ blocked on Q2 |
| 9 · Security & production readiness | ⬜ |

## Documents

**Discovery** — [WORKBOOK_REVIEW](WORKBOOK_REVIEW.md) · [TERMINOLOGY](TERMINOLOGY.md) · [REQUIREMENTS](REQUIREMENTS.md)
**Design** — [DATA_MODEL](DATA_MODEL.md) · [BUSINESS_RULES](BUSINESS_RULES.md) · [WORKFLOWS](WORKFLOWS.md) · [PERMISSIONS_MATRIX](PERMISSIONS_MATRIX.md) · [SECURITY_MODEL](SECURITY_MODEL.md)
**Build** — [SUPABASE_SETUP](SUPABASE_SETUP.md) · [IMPORT_MAPPING](IMPORT_MAPPING.md) · [TEST_PLAN](TEST_PLAN.md) · [DEPLOYMENT_NOTES](DEPLOYMENT_NOTES.md)
**Process** — [DECISIONS](DECISIONS.md) · [OPEN_QUESTIONS](OPEN_QUESTIONS.md) · [BACKLOG](BACKLOG.md) · [CHANGELOG](CHANGELOG.md)
