# Decision Log

Append-only. Superseded decisions are **marked**, never deleted.
Status: ✅ decided · 🟡 provisional (pending an answer) · ⚪ superseded

---

### D-001 ✅ Bed is the allocatable unit, not the room
**2026-07-31.** Rooms have zero-to-many beds; allocation targets a bed.
**Why:** the workbook already does this — rooms 6 and 9 appear only as 6A/6B and 9A/9B, never as
themselves. Modelling rooms as allocatable would need a special case for shared rooms in every query.
**Alternative rejected:** `rooms.capacity` with a counter — cannot express "6A is free, 6B is not".

### D-002 ✅ Double-booking prevented by a database exclusion constraint
**2026-07-31.** GiST `EXCLUDE` over `(bed_id, tstzrange(starts_at, ends_at))`.
**Why:** an application check loses to a race between two concurrent admissions and to any direct SQL
path. The constraint cannot be bypassed by the API, by a background job, or by an administrator with
a psql session.
**Cost:** requires the `btree_gist` extension.

### D-003 ✅ `due_at` and `completed_at` are separate; `overdue` is derived
**2026-07-31.**
**Why:** the workbook's single cell per action is the root cause of most of its problems — it cannot
say "due Monday, done Wednesday", so lateness is unmeasurable and the governance question "were
actions completed within expected timescales?" is unanswerable. Storing `overdue` as a status would
need a job to keep it true and would go stale between runs — the same failure mode in a new place.

### D-004 ✅ Client and admission are separate entities
**2026-07-31.** Tasks, allocations, milestones and discharge records hang off the admission.
**Why:** clients return. The whiteboard's row is a *bed*, so a client vanishes on discharge and a
returning client is indistinguishable from a new one.

### D-005 ✅ `original_planned_discharge_date` is immutable
**2026-07-31.** Trigger-enforced; only `current_…` may move, and only with a reason.
**Why:** one workbook row shows a client whose discharge sits 57 days after admission against a
recorded 28-day duration — almost certainly an extension, with no trace of what the original plan
was, who changed it, or why.

### D-006 ✅ Photographs are **not** auto-imported from the workbook
**2026-07-31.** Client rows import; photographs are uploaded and verified through the normal
workflow.
**Why:** the images are floating `oneCellAnchor` drawings whose anchor rows are off by one against the
client rows. Position is the only available link, and mis-attaching a photograph in a system where
photographs exist to confirm identity is a serious safety risk. Imported clients show "missing
photograph", which is accurate and actionable.
**Revisit if:** bulk photo import becomes a blocker — then compute image extents and require
human confirmation of every pairing.

### D-007 ✅ Sensitivity is a column, and metadata is split from narrative
**2026-07-31.** `safeguarding_records` exposes `severity`/`is_active` at level 1 and `summary` at
level 3, through separate grants.
**Why:** a dashboard must be able to show *"⚠ Restricted alert"* without leaking the text. Conflating
them forces a choice between hiding the alert entirely and exposing the narrative.

### D-008 ✅ Audit is append-only and excludes level-3 content
**2026-07-31.** `UPDATE`/`DELETE` revoked plus a blocking trigger. For level-3 tables the audit
records *that* a change occurred, by whom — not the text.
**Why:** otherwise `audit_events` becomes an unrestricted mirror of the safeguarding notes, readable
by anyone holding `audit.read`. The audit log must not be a side channel around the access model.

### D-009 ✅ Platform administrator has no implicit clinical read
**2026-07-31.**
**Why:** the brief asks for technical administration to be separated from clinical access. An admin
may grant themselves a clinical role, but that grant is an audited row with a `granted_by` — which is
the accountability the whiteboard has none of.
**Consequence:** `service_role` usage must be narrow and individually reviewed, since it bypasses RLS.

### D-010 ✅ Temporary access expires by predicate, not by job
**2026-07-31.** Every policy filters `now() < coalesce(ends_at, 'infinity')`.
**Why:** no scheduled task can fail to run, and there is no window during which lapsed access still
works.

### D-011 ✅ No family-meeting eligibility override in v1
**2026-07-31.** Per the brief; not to be added without explicit approval.
**Why:** an override that exists will be used, and a rule with a routine bypass is not a rule. Early
departures are handled by cancelling the meeting with a reason, not by overriding eligibility.

### D-012 ✅ Import preserves every original cell value
**2026-07-31.** `import_source_values` stores raw value, type, number format and interpretation.
**Why:** five date formats are in use, ~60% of date cells carry no year, and `X` may mean "done" or
"not applicable". Any interpretation may later prove wrong, and the original must survive that.

### D-013 ✅ Room and bed labels are text
**2026-07-31.**
**Why:** the workbook stores 14 as numbers and 4 as text. A numeric type cannot hold `6A`; a mixed
type invites `1` ≠ `"1"` bugs. Ordering uses `sort_order`.

### D-014 ✅ Admission captures date **and time**
**2026-07-31.**
**Why:** the 24-hour family-contact deadline is meaningless without it. The workbook stores date only,
so this is a new field the current process does not collect — flagged to the organisation as a
process change (Q12).

### D-015 🟡 Discharge date is inclusive of the admission day
**2026-07-31.** `discharge = admission + duration − 1`.
**Basis:** holds for 6 of 8 workbook rows.
**Provisional** pending Q3; implemented as `centres.settings.discharge_inclusive_of_admission_day`
so the answer changes a value, not code.

### D-016 🟡 Buddy modelled as a staff assignment, with a client alternative in place
**2026-07-31.** `staff_assignments` carries both a nullable `user_id` and a nullable
`buddy_client_id`, with exactly one required.
**Basis:** one buddy name recurs across three clients, which fits staff better than a peer — but not
decisively.
**Provisional** pending Q4. Either answer needs no migration.

### D-017 🟡 Separate repository and Supabase project recommended
**2026-07-31.** Phase 0 docs written into the existing `Pricing Ledger` repo because they are easy to
move; Phase 1 should not start until this is settled.
**Why:** the current repo is a public-facing pricing directory. A marketing site and a system holding
safeguarding narratives and client photographs should not share a database, an auth configuration or
a blast radius.
**Provisional** pending Q1.

### D-018 ✅ Local-only for now
**2026-07-31.** Local Supabase stack via Docker; no cloud project, no deployment.
**Why:** user instruction. Also avoids creating a Supabase project before the region decision (Q31),
which cannot be changed after creation.

### D-019 ✅ No Vercel, and no Vercel-specific dependencies
**2026-07-31.** Nitro's generic Node preset; portable build output.
**Note:** the existing repo contains a `.vercel` directory and a Vercel MCP connector is available in
this environment. Neither is used, and if Q1 resolves to a new repository the new one starts clean.

### D-020 ✅ Overdue and workload figures are computed, never cached
**2026-07-31.** Postgres views over live data.
**Why:** a cached count that lags is exactly what a whiteboard is. Revisit only if N-02 fails under
measurement.
