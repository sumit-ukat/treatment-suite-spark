# Architecture Gap Analysis — React + Supabase spec

**Date:** 2026-08-04
**Against:** the React/Supabase architecture specification
**Method:** live inspection of the running project, not recollection

Confirms the stack decision: **React + TypeScript + Supabase**. No Laravel. The existing build already
follows this architecture, so the work is extension rather than replacement.

---

## 1. Inspection findings — what exists today

| Area | Found |
|---|---|
| Tables | 19, **RLS enabled and forced on all 19** |
| Policies | 31 |
| Trusted DB functions | 11 in the `app` schema |
| Triggers | 29 (audit, updated_at, discharge recalculation, immutability) |
| Exclusion constraints | 1 — `room_allocations_no_double_booking` |
| Permission codes | 23 |
| Storage buckets | **0** |
| Storage policies | **0** |
| Edge Functions | **0** |
| Realtime subscriptions | **0** |
| Raw Supabase calls in components | 2, both in `AuthProvider.tsx` |

### Already meeting the specification

These are not aspirations; each was verified by test:

- **RLS on every table, deny-by-default.** An unassigned user reads 0 centres, 0 beds, 0 admissions.
- **Access resolved from database assignment tables, never from JWT metadata.** The spec calls this
  out explicitly; `app.accessible_centre_ids()` joins live assignment rows on every evaluation.
- **Active status, temporary access windows and read-only flags** are all evaluated inside the
  resolver rather than at call sites, so no caller can forget them.
- **Append-only audit** with UPDATE, DELETE and INSERT revoked — not merely unpolicied.
- **Bed double-booking refused by the database** via `EXCLUDE USING gist`, which holds under
  concurrency where an application-level check would not.
- **Original planned discharge immutable** by trigger.
- **Completion, cancellation and not-applicable constraints** enforced in the schema.
- **No service-role key in the browser.** The frontend carries the publishable key only.
- **Business logic in a trusted layer** — due-date computation, task generation and discharge
  recalculation are `SECURITY DEFINER` Postgres functions with pinned `search_path`.

---

## 2. Gaps against the specification

### 2.1 ✅ RESOLVED 2026-08-04 — permission codes restructured

Done in `0014` and `0015`. 40 codes, every role remapped from empty, old codes retired. Verified:
helpdesk sees the safeguarding flag and is refused the narrative; sees the client reference and is
refused the name. Helpdesk, support staff and regional operations hold zero clinical-detail grants.
Original analysis retained below.

---

### ~~2.1 🔴 Permission codes must be restructured~~ — and the new set is better

Current codes are coarser than the spec's, and one difference matters a great deal.

| Spec | Currently | Consequence |
|---|---|---|
| `risk.view_indicator` / `risk.view_detail` | `safeguarding.view` only | **Cannot express "sees the flag, not the narrative"** |
| `safeguarding.view_indicator` / `safeguarding.view_detail` | `safeguarding.view` only | Same |
| `medical.view_summary` / `medical.view_detail` | `medical.view` only | Same |
| `clients.view_operational` / `clients.view_identity` | `client.manage` only | Cannot show helpdesk a reference without the name |
| `tasks.reopen`, `rooms.transfer`, `discharge.finalise`, `reports.export` | absent | Distinct actions currently bundled into broader grants |

The indicator/detail split is the important one. The brief requires helpdesk to see
`Restricted alert — contact centre manager` **without** the content behind it. A single
`safeguarding.view` permission cannot represent that: it is either all or nothing. The spec's split
is the correct model and the current one should migrate to it.

**This must happen before roles are assigned to real staff.** Changing permission codes afterwards
means re-deciding every grant while people are relying on them.

### 2.2 ✅ RESOLVED 2026-08-04 — deletion of history prevented

Done in `0014`. `FOR ALL` policies replaced with explicit INSERT/UPDATE, and DELETE revoked outright
on `clients`, `admissions`, `room_allocations`, `client_tasks`, `task_assignments` and
`staff_assignments`. Verified that even an organisation-wide platform administrator is refused.

A related property surfaced during testing: `audit_events.actor_id` references `auth.users`, so **a
user whose actions appear in the audit log cannot be deleted either**. That is correct — accounts
should be deactivated via `user_profiles.is_active`, not removed — and it is now load-bearing rather
than incidental.

Original analysis retained below.

---

### ~~2.2 🔴 Deletion of history is not prevented~~

Both `client_tasks` and `room_allocations` carry `FOR ALL` write policies, which include `DELETE`.
A user holding `task.complete` can therefore delete a completed task, and one holding
`room.allocate` can delete an allocation.

The brief prohibits both — *"do not delete completed task history"*, *"do not delete old room
allocations"* — and the specification repeats it. The audit trigger records the deletion, so it is
detectable, but detection is not prevention.

**Fix:** revoke `DELETE` on both tables and replace the blanket `FOR ALL` policies with explicit
`INSERT` / `UPDATE` policies. Archive by status, never by removal.

### 2.3 Storage — entirely absent

No buckets, no policies. Required:

| Bucket | Contents |
|---|---|
| `client-photos` | Client photographs, private |
| `client-documents` | Documents attached to an admission |
| `workbook-imports` | Uploaded source spreadsheets |
| `generated-reports` | Exports |

All private, with storage RLS keyed to centre access, signed URLs on short expiry, file-type and
size validation, generated safe filenames, and access audited.

### 2.4 Edge Functions — none, but partially satisfied

The spec permits *"Edge Functions **or** secure database RPC functions"*. Four trusted workflows are
already implemented as the latter, so they are compliant.

The division worth adopting:

- **Postgres functions** — pure transactional data work. Faster, transactional by default, and they
  cannot be bypassed even by direct database access. Keep task generation, discharge recalculation
  and due-date computation here.
- **Edge Functions** — anything touching files, signed URLs, external services, or orchestration
  across storage and database. Workbook import, photograph upload and verification, and report
  export belong here and cannot be done well in SQL.

### 2.5 React structure — flat, needs feature modules

Current layout is `app/components/*` with a single `lib/supabase.ts`. The spec asks for feature
modules each owning components, hooks, queries, mutations, schemas, permission helpers, types and
tests.

Two raw Supabase queries sit in `AuthProvider.tsx`. Small, but it is the pattern the spec warns
against, and it is the right moment to introduce the service layer — before there are fifty of them.

The `src/domain/*` modules (100 tests) are already framework-free and move into the new structure
unchanged.

### 2.6 Realtime — none

Not yet warranted: nothing writes to the database from the UI. Becomes worthwhile once the room board
reads live data. Must be scoped to authorised centres, and the app must work correctly without it.

### 2.7 Tables still missing

`client_photos` · `documents` · `treatment_milestones` · `gp_summaries` · `family_contacts` ·
`family_meetings` · `detox_records` · `medical_review_requests` · `safeguarding_records` ·
`risk_records` · `discharge_records` · `escalations` · `notes` · `peep_records` · `import_jobs` ·
`import_source_values`

### 2.8 Constraints from the spec not yet enforced

- Actual discharge does not automatically end the active room allocation.
- Family meetings cannot be blocked before eligibility — the table does not exist yet.
- Deletion of task and allocation history is not prevented (see 2.2).

---

## 3. Recommended order

Extension, not rebuild. Nothing built so far needs discarding.

1. **Revoke DELETE on `client_tasks` and `room_allocations`.** Small, and closes a live hole.
2. **Migrate permission codes to the specification's set**, including the indicator/detail splits,
   and remap every role. Before real staff are onboarded.
3. **Storage buckets and policies**, then `client_photos` and `documents`.
4. **React feature modules and the service layer**, moving the two stray queries.
5. **Remaining client-record tables** — family, detox, medical, safeguarding, risk.
6. **Edge Functions** for import, photograph handling and exports.
7. **Discharge workflow**, including automatic room release.
8. **Realtime** on the room board, once it reads live data.

---

## 4. Decisions still open

- **Q41** — is a buddy a peer client or a member of staff?
- **Q2** — what `X`, `TRUE`, `FALSE` and blank each mean in the workbook.
- **Cross-centre client records** — should a client treated at two centres be visible to both?
- **Vercel** — the master prompt forbids it; the application is deployed there.
