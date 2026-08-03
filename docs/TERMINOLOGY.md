# Terminology

Every term below is taken verbatim from the workbook. **None has been confirmed by the organisation.**
Where a meaning is guessed, it is labelled as such and the guess is *not* relied on in code — the
affected structures are built generically until an answer arrives.

Status key: 🔴 unconfirmed, guess only · 🟡 partially inferred from data · 🟢 confirmed

---

## Unconfirmed internal terms

### 🔴 Peeps (column H)
**Brief suggests:** PEEPs = Personal Emergency Evacuation Plan.
**In the workbook:** a boolean on all 18 rows, `TRUE` for exactly one client, `FALSE` everywhere else
including all ten vacant rooms.
**Assessment:** the reading is plausible — a PEEP is required only for the minority of people who
need evacuation assistance, which matches 1-in-18. If correct, this is a fire-safety and
accessibility record, not a treatment one, and it likely needs a plan document, a review date and a
named responsible person rather than a checkbox.
**Modelled as:** `peep_records` (a table, not a boolean on `admissions`) so it can grow fields
without a migration.
→ Question 1.

### 🔴 CCP (column S)
**In the workbook:** six dates, one malformed `3//8`, one `TRUE`. Dates are spread across the
treatment period with no fixed offset from admission.
**Candidates considered:** Care/Continuing Care Plan · Comprehensive Care Plan · Client Care Plan ·
Continuing Care Planning session. All are guesses.
**Assessment:** the varied dates suggest a scheduled event or a plan-completion date rather than a
recurring series. Its due-date basis is unknown, which blocks building a template for it.
**Modelled as:** a milestone with a manually-set date until the basis is confirmed.
→ Question 2.

### 🔴 CP/121 (columns W–AA)
**In the workbook:** five columns — `Intro`, `Week 1`, `Week 2`, `Week 3`, `Week 4` — all dates,
one per client per week.
**Assessment:** `121` almost certainly denotes a **one-to-one** session. `CP` is unknown — possibly
Care Plan, Care Programme, or Counselling Plan. The Intro + weeks 1–4 shape maps cleanly onto a
28-day programme (the duration for 7 of 8 clients), which strongly suggests a **weekly recurring
one-to-one review** generated from the admission date.
**Modelled as:** a recurring weekly session series with a configurable offset (intro at admission,
then +7/+14/+21/+28 days) — the shape is safe even though the name is not understood.
→ Question 3.

### 🔴 Side Assignment (column R)
**In the workbook:** populated for only 3 of 8 clients, and holds a **topic** rather than a date or a
flag. The three values are short therapeutic themes (e.g. of the form "Boundaries",
"Control & Self Esteem").
**Assessment:** appears to be supplementary therapeutic work assigned to some clients at the
therapist's discretion — hence optional, and needing a free-text subject alongside its status.
Note it is the only column in the whole workbook that stores a *value* rather than a *state*.
**Modelled as:** an optional milestone with a `subject` text field.
→ Question 4.

### 🔴 Life Story / Surrender (column N)
**Assessment:** reads as two named pieces of step-work combined into one column — plausibly a written
life story and a surrender exercise. If they are two separate deliverables they need two templates,
since one could be complete while the other is not.
→ Question 5.

### 🔴 Group A / Group B (column T)
**In the workbook:** `A` for six clients, `B` for one, blank for one.
**Assessment:** unclear whether this is a therapy cohort, a programme stream, a meal/activity
rotation or a risk-based separation. It affects whether `Group` belongs on the admission or is a
scheduling entity in its own right.
**Modelled as:** `admissions.treatment_group` (a simple configurable code) for now.
→ Question 6.

### 🟡 Buddy (column G)
**In the workbook:** 6 distinct names across 8 clients; one name appears 3 times.
**Assessment:** in residential treatment a "buddy" is commonly a **peer** — another client, often
further through the programme — rather than a member of staff. The workbook gives no way to tell.
This matters a great deal:
- If a buddy is **staff**, it is a `staff_assignments` row pointing at a user.
- If a buddy is **another client**, it is a client-to-client link, it must end when either client is
  discharged, and showing buddy names to staff means showing one client's name on another client's
  record — a data-protection question, not just a modelling one.

Because the recurrence pattern (one name × 3) fits a staff member better than a peer, but not
decisively, this is treated as **open and blocking for the buddy feature only**.
→ Question 7.

### 🟡 Step 1 / Step 2 / Step 3 (columns O, P, Q)
**Assessment:** near-certainly the first three steps of a twelve-step programme, completed
sequentially. The data supports sequencing — where two dates exist for one client, Step 2 follows
Step 1. If confirmed, Step 2's due date could be derived from Step 1's completion (a
`prior_task_completion` due-date basis) rather than from admission.
**Modelled as:** three ordered milestones, due-date basis currently `manual`.
→ Question 8.

### 🟡 Focal Therapist (column E)
**Assessment:** the client's primary/named therapist and accountable clinician. Standard usage; low
risk. One client currently has none.
**Modelled as:** `staff_assignments` with `role = 'focal_therapist'`, at most one active per admission.

### 🟢 Detox ends (column U)
The date detoxification is expected to finish. Meaning is clear; only the recording convention is
ambiguous (`X` vs date vs `TRUE`).

### 🟢 GP Summary (column AE)
A summary sent to the client's GP. `TRUE` for all 8 current clients and `FALSE` for all 10 vacant
rooms — so either every client's summary is genuinely done, or the column means "required" rather
than "sent". → Question 9.

---

## Status values

| Value | Appears in | Best reading | Confidence |
|---|---|---|---|
| *a date* | 14 columns | Due or scheduled date; sometimes completion — see WORKBOOK_REVIEW §7 | 🟡 |
| `TRUE` | 11 columns | Done, date not recorded | 🟡 |
| `FALSE` | H, V, AE | Nothing recorded — *not* "not required" (it appears on vacant rooms) | 🟡 |
| `X` / `x` | K, P, Q, U, Y, Z, AA | Done, or not applicable — genuinely unknown, and the two cases need opposite handling | 🔴 |
| *blank* | many | Not yet due, or not applicable, or forgotten | 🔴 |
| `3//8` | S (one cell) | A mistyped date (`3/8`) | 🟡 |

The product replaces all of the above with an explicit status enum plus a separate completion
timestamp. See [BUSINESS_RULES.md](BUSINESS_RULES.md).

---

## Product vocabulary (defined by us, for consistency)

| Term | Meaning |
|---|---|
| **Organisation** | Top-level tenant. One for now. |
| **Zone / Region** | Grouping of centres for supervisory and regional oversight. |
| **Centre** | A treatment centre, e.g. Primrose Lodge. |
| **Room** | A physical room. May contain one or more beds. |
| **Bed** | The allocatable unit. Single rooms have one; shared rooms have `6A`, `6B`, … |
| **Client** | A person, persistent across episodes of treatment. |
| **Admission** | One episode of treatment. A client may have several over time. |
| **Task** | A dated, owned unit of work generated from a template or created ad hoc. |
| **Task template** | The per-centre rule that generates tasks and computes their due dates. |
| **Milestone** | A treatment achievement (step-work, life story). Modelled as a task with a milestone category. |
| **Due date** | When work *should* happen. Never overwritten by completion. |
| **Completed at** | When work *did* happen. Always separate from the due date. |
| **Sensitivity level** | 1 operational · 2 treatment coordination · 3 sensitive health/risk · 4 admin/security. |
| **Scope** | The set of centres a user may see, via an access assignment. |
| **Restricted indicator** | A placeholder shown to users who may know a record exists but not read it. |
