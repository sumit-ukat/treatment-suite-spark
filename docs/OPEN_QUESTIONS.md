# Open Questions

Questions are asked in rounds so each answer can be absorbed before the next set. **Round 1 is
below.** Nothing here blocks Phase 1 (project foundation) — every affected structure is being built
configurably. What each question *does* block is noted explicitly.

Legend: 🔴 open · 🟢 answered (with date and answer) · ⚪ superseded

---

## Answered 2026-08-05

### Q2 🟢 What does `X` mean?
**The client is not booked for that week — the programme does not reach it.** A two-week stay has no
week 3 or week 4.

So `X` is **not applicable**, which is distinct from outstanding and distinct again from unknown.

**Checked against the data before implementing.** Seven of the eight `X` marks are tasks whose
deadline falls after that client's discharge date — exactly as described. The eighth does not fit:
bed 1's week-3 session would fall due 6 Aug against a 12 Aug discharge, six days *inside* the stay.
Either a keying slip or a different reason for the mark. Flagged rather than forced to fit.

**Implemented as a rule, not a one-off translation.** Task generation now creates such tasks as
`not_applicable` with the reason *"Planned programme ends before this falls due"*. They are created
rather than skipped on purpose: if the stay is extended they must come back, and they cannot come
back if they were never written down. Extending or shortening a stay flips them automatically, while
leaving alone anything a human marked not applicable for their own reason, and anything completed.

### Q41 🟢 Is a buddy staff or a peer client?
**Staff — provided by the centre for every client.**

The earlier evidence pointing at "peer" (one buddy value matching a client name) was a coincidence of
first names. `assignee_kind` is now `staff | unresolved`; the `peer` option and
`peer_admission_id` column have been removed rather than left as a dead option that invites misuse.

Follow-on worth noting: since buddies are staff, they will eventually need user accounts to complete
their own tasks. Not urgent, but it affects the eventual user count.

### Q43 🟢 Is photograph verification required?
**No.** Photographs are taken at admission and that is the whole process.

Not deleted, because the master brief requires the capability and another centre may want it —
implemented as `centres.settings.photoVerificationRequired`, set false everywhere. With verification
off, a photograph is accepted on upload, and the dashboard counts only *missing* photographs.

The reasoning for making it configurable rather than removing it: "awaiting verification" would
otherwise be a status nobody ever clears, and an indicator that never resolves trains people to
ignore indicators.

---

## Round 4 — asked 2026-08-04

### Q43 🔴 May the person who uploads a photograph also verify it?
Upload and verification are separate permissions, so they *can* be held by different people. Nothing
currently stops one person doing both.

Arguments both ways. Verification exists to catch the wrong photograph being attached to the wrong
client — a second pair of eyes is the whole value, and self-verification reduces it to a formality.
Against that, a small centre on a night shift may have exactly one person available, and a control
that cannot be satisfied gets worked around.

Options: allow it · block it outright · allow it but record that upload and verification were the
same person, so it shows in the audit and in reporting.
*Blocks: nothing. Currently permitted.*

---

## Round 3 — asked 2026-08-04

### Q41 🔴 Is a "Buddy" a member of staff, or another client?
Evidence from the workbook points at **peer client**, but not conclusively:

- **One of the six buddy values is also the name of a client on the same board.** A staff member
  would not appear in the client-name column.
- Every buddy value is a **first name only** — but so is every therapist value, so that cuts both
  ways.

This matters more than it looks. If a buddy is a peer and we model them as staff, they land in
therapist workload figures, appear in staff pickers, and imply an account they should never have. If
a buddy is staff and we model them as a peer, the assignment cannot survive their client's discharge.

`staff_assignments.assignee_kind` supports `staff`, `peer` and `unresolved`, so imported rows stay
visible as a plain name until this is answered. No guess has been baked in.
*Blocks: resolving imported buddy assignments. Blocks nothing structural.*

### Q42 🔴 What is a Key Worker, and is it distinct from Focal Therapist?
`staff_assignments.role_code` allows `key_worker` because the role is common in UK treatment
services, but the workbook has no such column. Confirm whether it exists at Primrose Lodge and how it
differs from the focal therapist, or the value should be removed.
*Blocks: nothing yet.*

---

## Round 2 — asked 2026-08-03

### Q39 🟢 How many bed spaces does Primrose Lodge actually have?
**Answered 2026-08-03: 19.** primroselodge.com states 19 ensuite bedrooms; the whiteboard shows 16
rooms / 18 bed spaces. The website is authoritative.

**This is a finding, not a correction.** The whiteboard has been missing a bed space. A bed absent
from the board cannot be allocated, does not appear in occupancy, and — if occupied — describes a
client nobody is tracking against any of the required actions. It also means the reported occupancy
figure has been wrong: 8 of 18 (44%) should have been 8 of 19 (42%).

Follow-on question below; the seed still contains 18 beds until it is answered.

### Q40 🔴 **Which** bed space is missing from the whiteboard?
Nineteen cannot be seeded without knowing where the extra bed sits. The two plausible shapes:

- **A 17th room** — rooms 1–17, with 6 and 9 shared → **17 rooms, 19 beds**
- **A third shared room** — one existing room splits into A/B, e.g. `12A`/`12B` → **16 rooms, 19 beds**

Either is a data change only; no code changes, because room and bed configuration was never
hard-coded. Please confirm the exact label(s) — `17`, or which room gains an A/B pair.

Worth asking at the same time: **is that bed currently occupied, and has it been?** If so, there is a
client with no tracked family contacts, milestones or discharge actions.

*Status 2026-08-03: being checked with the centre. Seed stays at 18 meanwhile.*
*Blocks: correcting the seed and the room board. Blocks nothing in the schema or application code.*

---

## Round 1 — asked 2026-07-31

### Q1 🔴 Repository — new codebase, or extend this one?
The working directory `Pricing Ledger` currently holds a **different product**: a public-facing
treatment-centre *pricing directory* (TanStack Start + Supabase, routes `/pricing`, `/compare`,
`/centres/$slug`). The platform described in the brief is a clinical operations system with entirely
different data, users and risk profile.

**Recommendation: a separate repository and a separate Supabase project.** A public marketing site
and a system holding safeguarding narratives and client photographs should not share a database, a
deployment, an auth configuration or a blast radius. The two can be linked later at the data level if
useful.

Phase 0 documentation has been written into `docs/` here because it is easy to move. **Please confirm
before Phase 1** — this determines where the schema and migrations go.
*Blocks: Phase 1 start.*

### Q2 🔴 What do the status values mean?
Fourteen columns mix dates, `TRUE`, `X`/`x` and blanks (see [WORKBOOK_REVIEW.md](WORKBOOK_REVIEW.md) §7).
For a column such as `Step 1` or `2nd week Contact`, please confirm each:

- a **date** — is it the day the action was *due/booked*, or the day it was *done*?
- **`TRUE`** — done, but with no date recorded?
- **`X` / `x`** — done, or *not applicable*? (These need opposite handling, and both cases exist.)
- **blank** — not yet due, not applicable, or simply not filled in?

If the answer differs per column, a per-column answer is welcome — that is exactly what the import
mapping supports.
*Blocks: workbook import (Phase 8) only. The product's own model already separates due from done.*

### Q3 🔴 Is the discharge date inclusive of the admission day?
Six of eight rows fit `discharge = admission + duration − 1`, i.e. **the admission day counts as day
1**. Is that the intended rule?

Two rows do not fit, and we would value your reading of them:
- One client shows a **one-day** discrepancy — keying error, or a deliberate adjustment?
- One client was admitted 2026-06-02 with a 28-day duration but a discharge date of 2026-07-29
  (57 days). We have assumed a **treatment extension** where the duration field was not updated. Is
  that right?

*Blocks: discharge calculation and every task due-date derived from it. High priority.*

### Q4 🔴 Is a "Buddy" a member of staff or another client?
This changes the data model rather than a label. If a buddy is a **peer client**, it becomes a
client-to-client link that must end on either client's discharge, and displaying it means showing one
client's name on another's record — which needs a data-protection decision, not just a field.
*Blocks: buddy assignment feature.*

### Q5 🔴 Who may read safeguarding, risk and detailed medical information?
Column AF (`Safeguarding /Risks/ Concerns`) holds free-text narratives; the brief classifies these as
sensitivity level 3. Please confirm, for **read** access to the *narrative text*:

| Role | Read full narrative? |
|---|---|
| Therapist — own clients | ? |
| Therapist — other clients in centre | ? |
| Centre manager | ? |
| Supervisor | ? |
| Regional operations manager | ? |
| Support staff | ? |
| Helpdesk | ? |
| Platform administrator | ? |

Our default until told otherwise is **deny**, with everyone outside the permitted set seeing only
*"Restricted alert — contact centre manager"*. We specifically do not assume that regional or
administrator seniority implies clinical read access.
*Blocks: RLS policies for `safeguarding_records`, `risk_records`, `medical_review_requests`.*

### Q6 🔴 What can a therapist see?
Exactly one of:
1. Only clients where they are the focal therapist;
2. All clients in their treatment group (`A` / `B`);
3. All clients in their centre;
4. Their own clients in full, plus limited operational detail (name, room, status) for the rest of
   the centre.

Option 4 is our recommendation — it supports cover and handover without opening every record — but
this is your call.
*Blocks: RLS policy on `admissions` and `client_tasks`. High priority.*

### Q7 🔴 Early discharge — who initiates, who approves, who finalises?
Three distinct permissions. Please name a role for each, and tell us whether approval must come from
someone **other than** the initiator (we recommend yes), and whether it may be finalised
retrospectively when a client leaves without notice — which we expect is common and which the system
must handle without forcing anyone to record something untrue.
*Blocks: early-discharge workflow (Phase 6).*

### Q8 🔴 Terminology — please confirm the four unknown terms
**PEEPs** (is it Personal Emergency Evacuation Plan?) · **CCP** · **CP/121** (we read `121` as
one-to-one — is `CP` Care Plan?) · **Side Assignment**.

For **CCP** specifically we also need its *timing rule* — is it due a fixed number of days after
admission, before discharge, or scheduled ad hoc? The dates in the workbook show no consistent
offset, so we cannot infer it.
*Blocks: naming and due-date basis of four task templates. The template mechanism itself is not
blocked.*

---

## Deferred — Round 2 (task scheduling and family rules)

- Q9 🔴 `GP Summary` is `TRUE` for all 8 current clients. Does it mean "sent", or "required"?
- Q10 🔴 Exactly when is **1st week** family contact due? Day 7 from admission, or end of the first
  calendar week?
- Q11 🔴 Exactly when is **2nd week** family contact due?
- Q12 🔴 Is the 24-hour initial family contact measured from admission *time*, or is it "by end of the
  next day"? The workbook stores no admission time, only a date — so if the rule is time-based we
  need to start capturing it.
- Q13 🔴 Is the family-meeting rule **exactly 168 hours** from admission, or the start of the eighth
  calendar day?
- Q14 🔴 Are **family visit** and **family meeting** the same workflow or two different things? The
  workbook has one column (`Family Vist`); the brief lists both.
- Q15 🔴 Are `Life Story` and `Surrender` one deliverable or two?
- Q16 🔴 Is Step 2 due relative to Step 1's *completion*, or to the admission date?
- Q17 🔴 What is `Group` A/B — therapy cohort, programme stream, or something else?
- Q18 🔴 Does every centre use the same task schedule, or will Primrose Lodge's differ from others?

## Deferred — Round 3 (roles, photographs, oversight)

- Q19 🔴 Who may **upload**, **replace**, **verify**, **view** and **export** client photographs?
- Q20 🔴 May helpdesk see client **names**, or only a reference number?
- Q21 🔴 May helpdesk see client **photographs**?
- Q22 🔴 Which task categories may helpdesk complete (transport, admin) versus only route?
- Q23 🔴 Are supervisors read-only, or may they edit and reassign?
- Q24 🔴 May regional operations managers edit records, or is the role reporting-only?
- Q25 🔴 Is helpdesk organisation-wide, or scoped to zones/centres?
- Q26 🔴 Which roles may approve **temporary cross-centre cover**, and what is the maximum duration
  before it must be renewed?
- Q27 🔴 Should support staff see the `Substance` field? It is arguably clinical, but it appears on
  the operational whiteboard today.

## Deferred — Round 4 (governance, retention, hosting)

- Q28 🔴 Which of the workbook's actions are **mandatory** for CQC evidence, versus locally useful?
  This drives which templates are `required` and which failures escalate.
- Q29 🔴 How long must client records and audit events be retained? (Alcohol/drug services in England
  are commonly cited at ~8 years post-discharge, but this must be your organisation's policy, not our
  assumption.)
- Q30 🔴 Does the organisation have an existing identity provider (Microsoft Entra / Google
  Workspace), or should Supabase Auth manage users directly? SSO is far preferable for
  joiner/mover/leaver control in a service like this.
- Q31 🔴 Which hosting platforms are approved? Vercel is excluded. Is UK/EU data residency required?
  (We assume **yes** — please confirm, as it constrains the Supabase region and must be set at
  project creation, not later.)
- Q32 🔴 One organisation only for v1, or should multi-tenancy be live from the start?
- Q33 🔴 Is there a DPIA for this system, and should its outputs feed the retention and access model?
- Q34 🔴 Which centres follow Primrose Lodge, and roughly when? This affects how hard we push on
  per-centre configuration in v1.
- Q35 🔴 Is there an existing case-management or clinical system this must coexist with or import
  from, or is the whiteboard genuinely the only source?

## Deferred — Round 5 (operational detail)

- Q36 🔴 What happens to a bed **between** discharge and the next admission — is there a cleaning or
  void period that should block allocation?
- Q37 🔴 Can a client be moved rooms mid-treatment? (We assume yes and have modelled allocation
  history accordingly.)
- Q38 🔴 Should the doctor-review day be configurable per centre? (We assume yes — column AG
  hard-codes "Thursday" but is empty.)
- Q39 🔴 Do you need a printable/exportable daily handover sheet? It is the closest analogue to the
  physical whiteboard and may ease adoption.
- Q40 🔴 Are clients ever admitted to a centre while a bed is unavailable (waiting list / sofa
  night)? This decides whether an admission may exist without an allocation.

---

## Answered

*(none yet — this section will record each answer with its date and the documents updated in
response.)*
