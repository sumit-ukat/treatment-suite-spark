# Workflows

Each workflow lists its steps, its guards, and what it writes. Rules referenced as BR-n are defined
in [BUSINESS_RULES.md](BUSINESS_RULES.md).

---

## W1 · Admission

**Who:** centre manager, supervisor, support staff (within scope)

1. **Search for an existing client** by reference or name. Prevents a returning client being created
   twice — the workbook cannot do this at all, having no client identifier.
2. **Create the client** if none exists → `clients` row with a generated `reference`.
3. **Photograph** — upload or capture, or defer. Saved `unverified` (BR-28). Deferring is allowed and
   surfaces on the dashboard as "missing photograph".
4. **Select centre** (from the user's scope only).
5. **Admission date *and time*** — time is required by the 24-hour contact rule (BR-16).
6. **Treatment duration** in days (default from centre settings, 28 at Primrose Lodge).
7. **Expected discharge auto-calculates** (BR-7), shown and editable with a reason.
8. **Select an available bed** — the picker lists only beds in the selected centre that are free for
   the period, showing `available` / `occupied` / `maintenance` / `closed` and shared-room labels.
9. **Assign focal therapist**, **buddy**, **treatment group**, **doctor**.
10. **Primary substance**, **PEEPs**, operational notes.
11. **Review screen** — a summary of everything, including the tasks about to be generated and their
    computed due dates.
12. **Confirm.**

**Guards:** bed must be free (BR-2, database exclusion constraint), in the selected centre (BR-3), not
closed (BR-4); no existing active admission for the client; required fields present; discharge
calculation valid.

**Writes (one transaction):** `admissions` · `room_allocations` (open) · `staff_assignments` ·
`client_tasks` from every matching template (BR-13) · `family_meetings` with `eligible_from` computed
and stored (BR-19) · `peep_records` if flagged · `audit_events`.

---

## W2 · Room transfer

Select new bed → reason → confirm. Ends the current allocation, opens a new one (BR-5). Both
persist. The room board refreshes. Never an in-place edit of `bed_id`.

---

## W3 · Task completion

Open task → mark complete → completion note if the template requires one → optional evidence.

Sets `completed_at = now()` and `status = 'completed'`. **`due_at` is never touched** (BR-11), so
lateness stays measurable afterwards.

Alternative outcomes, each requiring a reason (BR-12): `cancelled`, `not_applicable`, `blocked`.
Reopening a completed task is permitted for authorised roles and is audited with the previous
completion.

---

## W4 · Family contact

Four separate obligations (BR-15). Recording one captures method, outcome and time. An **attempted**
contact that did not connect is recorded as attempted — neither done nor undone — which the
whiteboard's single checkbox cannot express and which matters when evidencing that the obligation was
pursued.

---

## W5 · Family meeting scheduling

1. Open the client's Family tab. `eligible_from` is displayed prominently.
2. The date picker **disables** anything earlier (BR-19).
3. Selecting a date, attendees and staff owner creates a `scheduled` record.
4. After the meeting: actual date, attendees, outcome.

Enforced at four layers — check constraint, server function, disabled picker, rejected-and-audited
API call. **No override in v1.**

If the client leaves before becoming eligible, the record is `cancelled`/`not_applicable` with a
reason — never completed (BR-21).

---

## W6 · Changing the planned discharge date

Requires a **reason**. Preserves `original_planned_discharge_date` (BR-8). Recalculates open
discharge-based tasks — notably the 24-hour pre-discharge contact — and leaves completed tasks alone
(BR-10). The change, with previous and new values, goes to the audit log.

Before saving, the UI shows exactly which tasks will move and to when. A silent bulk reschedule is
the kind of thing people stop trusting.

---

## W7 · Early discharge

**Not** an edit of the discharge date (BR-22).

1. **Initiate** — proposed date/time, reason, notes. The system displays outstanding tasks,
   GP-summary status, medical-review status and unresolved risks.
2. **Approve** — by a *different* user (BR-23; roles pending Q7).
3. **Finalise** — one transaction (BR-25):
   - `actual_discharge_at` set; `discharge_type = 'early'`;
   - `original_` and `current_planned_discharge_date` both preserved;
   - bed allocation ended, bed released (BR-6);
   - future tasks → `cancelled`/`not_applicable`, each with a reason;
   - the pre-discharge contact task is reviewed but **never fabricated as complete** if 24 hours'
     notice was impossible (BR-24);
   - outstanding work, GP-summary and risk states snapshotted onto `discharge_records`;
   - `audit_events` written for every step.

**Unplanned departures.** A client who leaves without notice is the common case, and the workflow must
not force anyone to record something untrue to close the record. Initiation and approval may
therefore be retrospective, with the actual time recorded as observed and the approval timestamped
when it genuinely happened — the audit log shows the real sequence. (Confirmation sought in Q7.)

---

## W8 · Photograph verification

Upload → `unverified` → a **different** authorised user reviews → verify (records verifier and time)
or reject with a reason. Unverified and missing photographs both appear as dashboard counts. Files
stay private; display uses short-lived signed URLs (BR-28).

---

## W9 · Medical review request

Raise against an admission with a reason and priority. `intended_review_date` defaults to the next
`doctor_review_weekday` from centre settings (BR-27). Appears in the doctor's queue and the centre
dashboard count. The doctor records the outcome; the outcome is level 3.

---

## W10 · Escalation

Raise from a task, an admission, or standalone. Category, summary, priority, assigned role/user, due
date. Routes: helpdesk/support/therapist → centre manager → supervisor → regional operations;
technical → administrator.

Sensitive detail obeys the same visibility rules — an escalation is not a side channel for level-3
content, and the escalation body is validated as level-appropriate before it is visible to a lower-
privileged assignee.

---

## W11 · Daily use

**Start of shift.** *My Work* → due today, overdue, unassigned in my team.
**Centre manager.** Dashboard → occupancy, overdue by owner, unassigned queue, missing/unverified
photographs, medical reviews, restricted alerts, upcoming discharges.
**Supervisor / regional.** Multi-centre view → completion rates, overdue by centre, therapist
workload, early discharges, centre comparison.
**Helpdesk.** Restricted task queue across assigned centres; route and escalate; sensitive content
shows only as *"Restricted alert — contact centre manager"*.

---

## W12 · Workbook import (Phase 8)

Upload → validate → select worksheet → detect and map headers (**including the unheadered client
column**) → classify each row as client or vacant-room (a row is a client row **iff** the name column
is populated) → map ambiguous values per column → sanitised preview → duplicate detection →
validation report → confirm → import summary + error report.

Photographs are **not** auto-imported in v1 (see WORKBOOK_REVIEW §5). Every original cell value is
retained in `import_source_values` (BR-32). Full detail in [IMPORT_MAPPING.md](IMPORT_MAPPING.md).
