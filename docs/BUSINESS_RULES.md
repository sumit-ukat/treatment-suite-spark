# Business Rules

Each rule states its **source** (workbook evidence, the brief, or our inference), where it is
**enforced**, and whether it is **configurable**. Rules marked ⚠ rest on an unconfirmed assumption and
are implemented as configuration so the answer changes a value, not the code.

---

## BR-1 — Bed is the allocatable unit

A room may hold one or more beds. Allocation is always to a **bed**.
*Source: workbook — rooms 6 and 9 appear only as 6A/6B and 9A/9B, never as 6 or 9.*
*Enforced: schema (`room_allocations.bed_id`). Configurable: per centre, via data.*

## BR-2 — No two active occupancies of one bed

Enforced by a Postgres exclusion constraint over `(bed_id, tstzrange(starts_at, ends_at))`, not by
application code. Unbypassable via API, race condition, or direct SQL.
*Source: brief. Enforced: database.*

## BR-3 — A bed may only be allocated within its own centre

Composite foreign key requires `beds.centre_id = admissions.centre_id`.
*Source: brief. Enforced: database.*

## BR-4 — A closed or maintenance bed cannot be allocated

Checked in the allocation function and by a trigger.
*Source: brief. Enforced: server function + trigger.*

## BR-5 — Room transfer preserves history

Never update an allocation's `bed_id`. End the current row (`ends_at = now()`), insert a new one with
a `transfer_reason`. Both survive indefinitely.
*Source: brief. Enforced: server function; direct updates to `bed_id` blocked by trigger.*

## BR-6 — Discharge releases the bed

On finalising discharge, the open allocation's `ends_at` is set to `actual_discharge_at`. The bed
becomes available from that instant (subject to Q36 on void periods).
*Source: brief. Enforced: server function, single transaction with the discharge record.*

---

## BR-7 ⚠ — Planned discharge is inclusive of the admission day

```
planned_discharge_date = admission_date + planned_duration_days − 1
```
*Source: **inferred** — holds for 6 of 8 workbook rows (WORKBOOK_REVIEW §8.1).*
*Configurable: `centres.settings.discharge_inclusive_of_admission_day`. Pending Q3.*

Both `original_planned_discharge_date` and `current_planned_discharge_date` are set from this at
admission. The original is then **never** written again.

## BR-8 — The original planned discharge date is immutable

Enforced by trigger: any `UPDATE` changing `original_planned_discharge_date` raises. Only
`current_planned_discharge_date` may move.
*Source: brief. Rationale: one workbook row shows a 29-day extension with no trace of the original
plan. This makes that impossible.*

## BR-9 — Changing the planned discharge date requires a reason

The change is applied through a server function taking `(admission_id, new_date, reason)`. It writes
an `audit_events` row with previous and new values, then recalculates open tasks (BR-10). A direct
`UPDATE` without a reason is blocked by trigger.
*Source: brief. Enforced: server function + trigger.*

## BR-10 — Recalculation touches only open, discharge-based tasks

When `current_planned_discharge_date` changes, for every `client_task` where
`template.due_basis = 'planned_discharge'` **and** `template.reschedule_on_discharge_change = true`
**and** `completed_at is null` **and** `status not in ('cancelled','not_applicable')`:
recompute `due_at`, and audit the old and new values.

**Completed tasks are never touched.** Their due date is historical evidence of whether the work was
on time. Overwriting it would rewrite the record of a past deadline.
*Source: brief. Enforced: server function.*

---

## BR-11 — `due_at` and `completed_at` are always separate

No status is inferred from a date and no date is overwritten by completion. `overdue` is **derived**,
never stored:
```sql
due_at < now() AND completed_at IS NULL
  AND status NOT IN ('completed','cancelled','not_applicable')
```
*Source: brief, and the workbook's single-value cells (WORKBOOK_REVIEW §7). Enforced: schema + view.*

## BR-12 — Blank, false, cancelled and not-applicable are four different things

| State | Meaning | Requires |
|---|---|---|
| `not_started` | Exists, not begun | — |
| `cancelled` | Will not happen | `cancellation_reason` |
| `not_applicable` | Never applied to this client | `not_applicable_reason` |
| *(no row)* | The template did not apply to this admission | — |

Check constraints make a reasonless cancellation impossible.
*Source: brief. Enforced: database check constraints.*

## BR-13 — Task generation at admission

On admission, every active `task_template` matching the centre and programme generates a
`client_tasks` row with `due_at` computed from its basis and offset, and an owner from
`default_owner_rule` (or left unassigned, which is a valid and visible state).
*Source: brief. Enforced: server function, same transaction as the admission.*

## BR-14 — A task may exist without an owner

`assigned_user_id` is nullable. Unassigned tasks surface in the centre's unassigned queue by
`responsible_role_code`. This is deliberate: work must be visible before someone is named, which the
whiteboard cannot express at all.
*Source: brief.*

---

## BR-15 — Four distinct family-contact obligations

`initial_24h`, `week_1`, `week_2`, `pre_discharge` are four templates and four records. Never merged.
*Source: brief + workbook columns I, J, K, L.*

## BR-16 ⚠ — Initial family contact within 24 hours of admission

`due_at = admitted_at + interval '24 hours'` (`centres.settings.initial_family_contact_hours`).
Requires an admission **time**; the workbook stores only a date, so admission time becomes a required
field. Pending Q12.
*Source: brief. Configurable: per centre.*

## BR-17 ⚠ — First- and second-week family contact

Placeholder offsets `+7 days` / `+14 days` from admission. Pending Q10/Q11.
*Configurable: per template.*

## BR-18 — Pre-discharge family contact = current planned discharge − 24 h

```
due_at = current_planned_discharge_date − interval '24 hours'
```
Recalculated whenever the discharge date moves (BR-10), which is exactly the failure the workbook
demonstrates: its `24h prior to leaving` values were computed by hand and one client's discharge then
moved 29 days without the deadline following.
*Source: brief; corroborated by workbook (5 of 6 rows equal discharge − 1 day).*

## BR-19 — A family meeting cannot occur before eligibility

```
eligible_from = admitted_at + centres.settings.family_meeting_eligibility_hours   -- default 168
```
Computed **and stored** on the `family_meetings` row at admission, so a later configuration change
cannot retroactively alter what was permitted at the time.

Enforced at four layers:
1. `CHECK (scheduled_at IS NULL OR scheduled_at >= eligible_from)` — database;
2. the scheduling server function re-validates;
3. the date picker disables earlier dates;
4. an API request with an earlier date is rejected and audited.

⚠ Whether "one week" means exactly 168 hours or the start of the eighth calendar day is Q13.
**No override exists in v1** — per the brief, and not to be added without explicit approval.
*Source: brief. Not evidenced in the workbook (WORKBOOK_REVIEW §8.3).*

## BR-20 — The seven-day rule does not block the 24-hour contact

Eligibility gates `family_meetings` only. `family_contacts` of type `initial_24h` is unaffected —
they are different obligations and conflating them would suppress a required contact.
*Source: brief.*

## BR-21 — Early discharge before eligibility does not fabricate a meeting

The family-meeting record is set to `cancelled` or `not_applicable` with a mandatory reason. It is
**never** marked complete, and the row is never deleted.
*Source: brief.*

---

## BR-22 — Early discharge is a workflow, not a date edit

Overwriting `current_planned_discharge_date` is not a discharge. A `discharge_records` row is created
with initiator, reason, approval state, and snapshots of outstanding tasks, GP-summary status,
medical-review status and unresolved risks.
*Source: brief.*

## BR-23 ⚠ — Approval is separate from initiation

The approver must be a different user from the initiator. Roles pending Q7.
*Configurable: role codes in settings.*

## BR-24 — Discharge never fabricates completion

If 24 hours' notice was impossible, the pre-discharge contact task is **not** marked complete. It is
recorded as incomplete-at-discharge with a reason. Future tasks become `cancelled` or
`not_applicable`, each with a reason; nothing is deleted.
*Source: brief. Rationale: a system that quietly closes impossible tasks produces evidence that is
worse than none.*

## BR-25 — Finalising discharge is atomic

One transaction: set `actual_discharge_at` and `discharge_type`; end the bed allocation; reconcile
open tasks; snapshot outstanding work; write the audit events. Partial discharge is not a reachable
state.
*Source: brief.*

---

## BR-26 — Sensitive narratives never leave their table

`safeguarding_records.summary`, `risk_records.summary`, `notes.body` (therapy) and medical detail are
level 3. They are excluded from dashboards, room cards, task queues, exports, application logs and
audit diffs. Callers without permission receive *"Restricted alert — contact centre manager"*,
generated from `severity` + `is_active` alone.
*Source: brief. Enforced: RLS + column-level view separation.*

## BR-27 — Doctor review day is per-centre configuration

`centres.settings.doctor_review_weekday`. The workbook hard-codes "Thursday" in a header — and that
column is empty.
*Source: brief + workbook column AG.*

## BR-28 — Photographs are private and verification is a separate act

Upload sets `verification_status = 'unverified'`. A different, authorised user verifies, and
`verified_by` / `verified_at` are recorded. Replacement inserts a new row and deactivates the old
one. Files live in a private bucket, served only by short-lived signed URLs.
*Source: brief. Pending Q19 on which roles.*

## BR-29 — Every significant action is audited, append-only

Insert-only. `UPDATE`/`DELETE` revoked from all application roles and blocked by trigger, including
for `platform_admin`. Denied access attempts are recorded with `outcome = 'denied'`.
*Source: brief.*

## BR-30 — Deny by default, everywhere

No access assignment ⇒ no rows. No inheritance from seniority; no implicit organisation-wide read.
Every RLS policy is an allow-list.
*Source: brief.*

---

## BR-31 — Times are stored UTC, displayed in centre time

All `timestamptz`. Rendered in `centres.timezone` (default `Europe/London`). "Due today" means today
*in the centre's timezone*, so a 23:00 BST deadline is not shown as tomorrow. Deadline arithmetic is
done in interval terms, not by adding 86,400 seconds, so it stays correct across BST/GMT transitions
— relevant because a 28-day admission commonly spans one.
*Source: inference; flagged in the brief's test requirements.*

## BR-32 — Import preserves original values

Every source cell is stored verbatim in `import_source_values` with its number format and its
interpretation. Ambiguous values are flagged, not guessed silently. Nothing is normalised
destructively.
*Source: brief. See [IMPORT_MAPPING.md](IMPORT_MAPPING.md).*

## BR-33 — No automated clinical decision-making

The system schedules, reminds, records and evidences. It does not assess risk, recommend treatment,
score clients, or make any clinical judgement. Any future analytics must stay descriptive.
*Source: brief. This is a hard product boundary, not a v1 scope limit.*
