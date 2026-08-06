# Changelog

Dated entry for every material change. Newest first.

---

## 2026-08-06 — A client directory, and closing the admission-form gap it was named for

Until now the only way to find a client was already having their bed open on the room board — no
search, no way to look someone up by name or reference. `AdmitClientForm.tsx`'s own header comment
named this explicitly: it was scoped to creating a new client only, "because... that needs a client
directory to search, and the Clients screen does not exist yet." `app.admit_client` (migration 0022)
has supported reusing an existing client via `p_client_id` since it was written — the frontend gap was
the only thing missing.

**`app.search_clients(p_centre_id, p_query)`** (migration 0028, `public` wrapper per 0024) closes both
gaps with one function. Scoped to a single centre, not the organisation — "every centre operates on
its own... there is no data sharing between those" is a standing decision for this product, so a
client only appears in a centre's directory if they have at least one admission (any status, so a
discharged client is still findable) *at that centre*. The identity split mirrors `client_summary`
(migration 0025) exactly: `clients.view_operational` can search by reference; `clients.view_identity`
is additionally required to search by name or see one back. A caller lacking `view_identity` is not
given a "does this name exist" side channel by matching on it and then hiding the result — the name
match itself is withheld, never attempted, not just the display.

**Two new UI surfaces from one search:**
- **Clients** (`ClientDirectory.tsx`), a new per-centre screen — the sidebar's `clients` nav slot has
  existed unused since the shell was built, now wired up. Read-only: there is no client file screen to
  link a result to yet (tracked in the backlog), so a result shows exactly what search returns and
  nothing more.
- **`AdmitClientForm.tsx`** now has "Existing client" / "New client" tabs. "Existing client" searches
  and picks; a client already showing an open admission (checked via `has_open_admission`, which is
  global — the `admissions_one_open_per_client` index from migration 0004 allows at most one anywhere,
  not per centre) is visible but not selectable. "New client" is disabled, not hidden, for a role
  lacking `clients.edit_identity` — the server's own rule (migration 0022: creating a client needs that
  permission, reusing one does not), surfaced honestly rather than failing silently at submit.

### Verified with 11 SQL assertions across two fictional roles and two centres

helpdesk (operational only) searching by name gets zero rows — not a blank-name row, no row at all;
the same role searching by reference gets the reference with a null name; a name search that would
also coincidentally match no reference substring confirmed no side channel exists. An identity-holder
searching by name gets the name; the same works for a discharged client, correctly reporting
`has_open_admission = false`. **Centre scoping, the one most worth getting wrong**: a client admitted
only at Providence Projects is invisible when searching from Primrose Lodge, and found when searching
from Providence Projects — proven with the same signed-in user holding access to both, so the
difference is provably the centre parameter, not the caller's permissions. A query under 2 characters,
and a blank one, both return nothing. All fictional data removed afterward; zero rows left.

### Verified end-to-end in the browser, including the reuse path

Directory search rendered both a currently-admitted and a discharged fictional client with the correct
status chips. In the admission form: switched to "Existing client", searched, confirmed the
already-admitted client was shown but disabled, selected the discharged one, and admitted them —
the review screen read "(existing)"; confirmed via direct query that the **same `client_id`** was used
across both admissions, not a new client row. The room board picked it up immediately: 0/18 → 1/18,
correct reference, 20 tasks generated. All test data removed afterward; confirmed 0/18 again on a cold
reload.

---

## 2026-08-06 — The discharge workflow, and a second live bug found while proving it in the browser

Admission and daily task tracking both worked, but nothing could ever end a stay: a bed, once filled,
stayed filled forever. Occupancy could only go up — one real discharge and every downstream number
(available beds, the group hub's occupancy percentage) is permanently wrong.

Three permission codes have existed since migration 0014 with nothing behind them:
`discharge.initiate` ("Initiate an early discharge"), `discharge.approve` ("Approve an early
discharge"), `discharge.finalise` ("Finalise a discharge" — no "early" in that one). Read literally,
that is two paths, not three steps of one: a routine discharge on the planned date needs only
`discharge.finalise`; anything else (early / transfer / other) needs a **different person** to approve
it first. This reading is inferred from the permission text and the seeded role grants (centre_manager
holds initiate + finalise but not approve; supervisor holds only approve; only platform_admin holds all
three) — nothing in the brief specifies the workflow explicitly, so it is stated plainly in migration
0027 rather than assumed silently, and worth confirming against how UKAT actually wants transfers
handled.

**`app.request_early_discharge` → `app.decide_discharge_request` → `app.finalise_discharge`**
(migration 0027, `public` wrappers per 0024), backed by a new `discharge_requests` table. Following the
`client_tasks` precedent (migration 0026): every write goes through a SECURITY DEFINER function, DML is
revoked from `authenticated`/`anon` entirely, and — the one rule specific to this table — **the person
who requested a discharge cannot approve or reject it themselves**, enforced server-side, not just
hidden in the UI. A routine planned discharge skips the request table entirely and calls `finalise`
directly.

The UI lives in the room board's detail panel: a **Discharge…** button that either finalises directly
(planned) or submits for approval (early/transfer/other); the resulting pending/approved state renders
there until someone else decides it and someone with `discharge.finalise` closes it out.

### Verified with 22 SQL assertions across three fictional roles

helpdesk can finalise nothing; centre_manager finalises a routine discharge directly (bed freed,
admission marked discharged); an already-discharged admission can't be discharged again; finalising
`early` with no approved request is refused; centre_manager initiates a request; helpdesk can't approve
it; **platform_admin, holding both initiate and approve, is refused when trying to approve their own
request** — the separation-of-duties rule holds even for the one role that could otherwise bypass it; a
second pending request on the same admission is refused; a different person (supervisor) approves it;
re-deciding an already-decided request is refused; centre_manager finalises the approved request (bed
freed, request consumed to `finalised`); rejection with a reason works and does not block a later
retry; future-dated and pre-admission-dated discharges are both refused. All fictional data removed
afterward; zero rows left.

### Two real bugs found while proving this in the browser, neither hypothetical

**The date field defaulted to today, combined with a fixed noon-London time-of-day — a convention used
safely elsewhere in this codebase for calendar dates, but `finalise_discharge` refuses anything after
"now", and noon is in the future for anyone signing in before midday.** Every discharge attempted before
noon would have been refused with a confusing "cannot be recorded in the future" error. Fixed by using
the actual current instant whenever the naive noon value would be later than it, falling back to noon
only for a genuinely backdated entry where the exact time was never known anyway.

**`identity.profile()` queried `user_profiles` with no `.eq('id', ...)` filter, relying entirely on RLS
to narrow the result to one row.** `profiles_read_self` (migration 0006) reads `(id = auth.uid()) OR
app.can_read('administration.manage_users')` — RLS only narrows to "my own row" for someone who
*cannot* also read every profile. For platform_admin, who can, it legitimately returns every row, and
`.maybeSingle()` throws the moment a second profile exists. That moment is not rare: it is the first
time any platform_admin signs in after a second staff account is created — which is exactly what
happened here, live, creating fictional users for this feature's own browser test, on a database that
until now had only ever had one real profile in it. **Every previous "verified in the browser" claim in
this changelog was tested with exactly one profile in existence and could not have caught this.** Fixed
by filtering to `auth.getUser().id` explicitly — the one deliberate exception to this file's own "RLS
does the filtering" rule, documented in `data-access.ts` as such so it is not "corrected" back later by
someone citing that same rule.

### Verified end-to-end in the browser, both paths, one real login

Planned: discharged a fictional occupant directly — occupancy 2/18 → 1/18, bed showed Available, no
manual refresh. Early: requested as platform_admin, confirmed the UI correctly hid the approve/reject
controls and showed "You requested this" (the separation-of-duties rule reflected in the UI, not just
enforced server-side); approved via a fictional supervisor at the SQL layer (no second real login
exists); reloaded and confirmed the panel picked up "approved — ready to finalise" with the supervisor's
notes; finalised through the real UI — occupancy 1/18 → 0/18, request consumed. All test data,
including the fictional supervisor account, removed afterward; confirmed via a further cold reload that
Bilal's own session is unaffected.

---

## 2026-08-05 — Tasks can finally be completed — and a second bypass closed

Until now the task system was read-only decoration. 20 templates were seeded, tasks were generated on
admission, and the room board counted them as overdue and due-today — but **no function to complete one
existed in either schema**. The counts could never change. Tracking whether actions actually got done
is the entire purpose of the workbook this tool replaces, so this was the largest functional gap left.

`app.complete_client_task` and `app.reopen_client_task` (migration 0026, with `public` wrappers per
0024) now own that, plus the UI in the detail panel: a **Mark done** button per open action, and
**Reopen** on completed ones for roles holding `tasks.reopen`.

### A second bypass, of the same shape as the last one

`client_tasks_update` allowed any holder of `tasks.complete` to UPDATE **any column** of any task at an
accessible centre, straight through PostgREST — because RLS filters *rows*, not *columns*. Correct as a
row filter, it constrained nothing about what could be changed. Four things it permitted, all plain
PATCH calls rather than hypotheticals:

- completing a task that requires a completion note, without one;
- setting `completed_by` to someone else, misattributing the work;
- reopening a completed task while holding only `tasks.complete`, never `tasks.reopen`;
- editing `due_at` to move one's own deadline and erase being overdue.

The last matters most: **an operations-compliance tool whose deadlines the accountable person can
silently rewrite does not measure compliance.** UPDATE is now revoked from `authenticated` and `anon`
entirely, making the RPCs the only path. A full revoke rather than column-level grants, because no
screen updates a task directly today, so nothing needs the exception — and an exception granted "just
in case" is how this bypass existed in the first place. The now-unreachable policy is deliberately
kept, so a future re-grant does not silently carry no row filter at all.

**Deliberately not built:** recalculation of dependent due dates on completion. `app.compute_due_at`
supports a `prior_task_code` chain, but no seeded template uses one — checked, not assumed — so that
machinery would have nothing to drive it.

### Verified with SQL role impersonation, 11 assertions

Therapist (holds `tasks.complete`, not `tasks.reopen`) completes a task and is recorded as
`completed_by`; a note-requiring task is refused with a blank note and accepted with one; double
completion refused; therapist cannot reopen; helpdesk cannot complete; reopen refused without a
reason; platform_admin reopens and the completion is cleared; the reason reaches
`audit_events.reason`. And the bypass itself: a direct `update client_tasks set due_at = …` now fails
with `permission denied for table client_tasks`. All fictional test data removed; zero rows left.

### Verified in the browser, including a cold load

Completed an overdue action (persisted, attributed to the signed-in user, counter moved 0→1 of 20 with
no manual refresh); a note-requiring action prompted for the note and stored it; reopening it with a
reason **returned it to Overdue**, which is the point — undoing a completion restores the lateness it
was hiding. Two React dep-array warnings in the console were confirmed stale HMR artifacts, not live
bugs: they did not reappear after a cold reload and full re-navigation, and a repo-wide check found no
missing imports.

---

## 2026-08-05 — A real, live security gap: `clients` leaked identity past `clients.view_identity`

Found by self-review, not reported by the user: the `clients_read` RLS policy (migration 0006) granted
SELECT on `clients` to any role with an admission at an accessible centre, and never checked
`clients.view_identity` — even though that permission code has existed since migration 0014
specifically to withhold real names from roles like helpdesk. Verified live with a fictional
helpdesk-role session: it could `select first_name from clients` and read a real name it should never
see. This is the same indicator/detail gap already closed for safeguarding, risk and medical detail —
just not yet applied to identity itself, and identity is the one every other screen touches first.

**What makes this worse than an isolated bug:** the previous entry's "verified" room board relied on
exactly this hole. `data-access.ts`'s `roomBoard.forCentre` read the `clients` table directly, which
only worked because the policy let it. Tightening the policy alone, without touching that call site,
would have traded a leak for a different bug — every occupied bed silently rendering as if it had no
one in it for any role lacking `clients.view_identity`, since the tightened RLS would return zero rows
instead of throwing.

**The fix, in one migration (`0025_fix_client_identity_leak.sql`):**
- `clients_read` now requires `app.has_permission('clients.view_identity')` in addition to centre
  access — closing the leak.
- `app.client_summary(p_client_ids uuid[])` + its `public` wrapper (same reachability pattern as
  migration 0024) return `reference` to any caller holding `clients.view_operational`, and
  `display_name` only to callers additionally holding `clients.view_identity` — `null` otherwise,
  never an error, so existence can't be inferred from a failure.
- `roomBoard.forCentre` now calls `client_summary` instead of `select`-ing `clients` directly;
  `real-board-data.ts`'s `buildRealOccupant` falls back to showing the `reference` when
  `display_name` is `null`, rather than treating a permission-denied client as an empty bed.

**Verified with SQL role impersonation** (RLS only enforces under `set local role authenticated` —
the connection used for migrations is a superuser and bypasses RLS regardless of JWT claims, which the
first pass of this test got wrong and had to redo): platform_admin and therapist (both hold
`clients.view_identity`) get the real name from both the raw table and `client_summary`; a fictional
helpdesk role gets zero rows from the raw table and `{ reference: "…", display_name: null }` from
`client_summary`. All temporary rows and users removed afterward; confirmed zero leftovers.

**Verified in the browser**, cold reload, signed in as platform_admin: created one fictional occupied
bed via SQL, reloaded, saw "Fictional TestOccupant" with reference "BROWSER-VERIFY-1" render correctly
through the new RPC path — no regression for the one role with a real login. Removed afterward.

---

## 2026-08-05 — The room board now reads real data

The gap this closes: the admission form (previous entry) proved it could write a real client into
Supabase, but nothing in the app ever displayed the result — the room board still rendered the
fictional/frozen file, so an admission just made was invisible everywhere. That inconsistency was
the single biggest thing undermining trust in what has been built so far, worth fixing before
anything else.

`src/features/rooms/real-board-data.ts` reads `admissions`, `room_allocations`, `staff_assignments`
and `client_tasks` directly and assembles them into the exact `BoardBed`/`Occupant` shape
`board-data.ts` already exports. **`BedCard`, `BedList` and `DetailPanel` render this with no changes
of their own** — the whole presentation layer built for the fictional board turned out to generalise
to real data without modification, which is the payoff of having kept that layer free of import-
specific assumptions.

Three fields on `Occupant` exist only to describe a workbook import (`recorded`,
`calculatedDischargeDate`, `dischargeMismatchDays`) and — checked by grep rather than assumed — are
not read by any UI component. They get inert placeholders for real data rather than being left
undefined, since a real admission has exactly one source of truth and no import discrepancy to
describe.

**Deliberately not wired: the restricted-alert flag.** Showing it for real needs
`app.safeguarding_indicator` / `app.risk_indicator`, which are exactly as unreachable from the
browser today as `admit_client` was before its `public` wrapper — and no safeguarding or risk
records exist yet regardless, since the UI to create them hasn't been built. Wiring the flag now
would be decoration with nothing behind it, so it stays `false` until there is something to report.

**Scope boundary:** only the centre-level room board moved to real data. The group hub's occupancy
and overdue figures still come from the fictional `centres-data.ts` — a separate, larger piece of
work, since it spans all ten centres rather than one.

### A second real bug, found the same way as the first — by using it, not by reading it

After admitting a client and navigating back to the room board, the newly admitted client did not
appear. The board only re-fetched when the *centre* changed, not when the *view* was re-entered — so
returning to an already-loaded board silently showed the pre-admission state. Fixed by re-fetching
whenever the board view becomes active, not only when the centre selection changes.

### Verified against a real, fresh page load — not the same session that built it

Reloaded the app cold, signed in for real, navigated to Primrose Lodge: **0/18 occupied**, 18 real
bed rows — accurate, since no real admissions existed. Admitted a client through the real form,
returned to the board, and saw it update to **1/18**, the correct client on bed 7, correct
reference, correct discharge date (28 days from today), correct task counts, "No therapist" flagged
because none was given. Test data removed afterward; confirmed the board reads 0/18 again.

---

## 2026-08-05 — Admission form, and a real gap found by using it for real

`src/features/admissions/AdmitClientForm.tsx` — the first screen that calls `admit_client` rather
than SQL calling it directly. Collects input, shows a review step, sends one RPC call. It performs no
business logic of its own: whether a bed is really free, whether the discharge date is right,
whether a duplicate exists is decided by the database, and a wrong submission is refused rather than
silently accepted.

**Scoped to new clients only.** The brief also asks for reusing an existing client via search; that
needs a client directory to search against, which does not exist yet. Building a search box with
nothing to search would be worse than leaving it out, so it is left out and stated plainly here
rather than half-built quietly.

### A real gap, found by the first real use rather than by inspection

The first call through the actual Supabase client — not through direct SQL — failed:

> Could not find the function public.admit_client(...) in the schema cache

PostgREST only resolves RPC calls against schemas it exposes, which is `public` by default. Every
trusted function built so far lives in `app`, and **every single one had, until this moment, only
ever been exercised via direct SQL through a connection with full database access** — which bypasses
PostgREST entirely. This was the first call made through the real client-facing path, and the gap
was invisible until that path was actually used. It affects every `app.*` function, not just this one.

Fixed with a thin `public.admit_client()` wrapper that delegates straight to `app.admit_client()` —
no logic duplicated, every check stays where it was. `app` remains unreachable from the API even in
principle; the public surface is exactly what is deliberately exposed. The same wrapper will be
needed for any other `app.*` function a future screen calls directly, added when that screen is
built rather than pre-emptively.

### Verified in the browser, against the real database, not by assertion

Filled in the actual form and submitted: client created, admitted to bed 4, 20 tasks generated.
Confirmed directly in Supabase — real client row, real admission, correct bed, correct discharge
date, 1 staff assignment, 1 audit event. Reloaded the form and watched available beds drop from
**18 to 17**, with bed 4 no longer offered. Test data removed afterward; confirmed zero stray
clients and zero open allocations at Primrose Lodge.

---

## 2026-08-05 — Trusted admission workflow: `app.admit_client()`

The gap this closes: until now there was no way to create a real client or admission at all. The
only real data in the database was the room/bed layout — every safety feature underneath it (double-
booking prevention, task generation, audit) had nothing to actually run against.

`app.admit_client()` is one SECURITY DEFINER function that does everything brief section 9 asks for
as a single atomic unit, rather than a sequence of separate client calls a half-finished network
request could leave inconsistent:

- resolves an existing client by id, or creates one (auto-generated reference `CL-XXXXXXXX`)
- validates the bed belongs to the selected centre, with a clear error ahead of the raw constraint
- computes the planned discharge date via the new `app.calculate_planned_discharge()`
- opens the room allocation — refused by 0005's exclusion constraint on a double-booking, including
  under concurrency; this function supplies the friendly error in front of that constraint
- records focal therapist, buddy and doctor as `staff_assignments`, unresolved-by-label by default
  (Q41)
- generates the admission's 20 tasks
- audit is written by the existing triggers on `clients`/`admissions`/`room_allocations`/
  `staff_assignments` — not duplicated in this function

**`app.calculate_planned_discharge()`** is the SQL twin of `calculatePlannedDischargeDate` in
`src/domain/discharge.ts` — same duplication rationale as `compute_due_at`: the browser previews, the
database enforces, and both must agree.

### Verified — 14 assertions, all against the live function, not a mock

Full admission end to end: client created, reference auto-generated, discharge computed as
admission + 28 − 1 (inclusive), bed allocated, therapist/buddy/doctor all recorded, 20 tasks
generated, both the admission and the client creation appear in `audit_events`.

**All four things brief section 9 requires the workflow to prevent, all refused:**
- a duplicate active admission for the same client — `23505`
- allocating an already-occupied bed — `23P01` (the exclusion constraint)
- an invalid duration (zero)
- missing required identity information

And permission enforcement: a fictional helpdesk account (no `admissions.create`) was refused the
same call — `42501`.

Test data fully removed afterward; confirmed zero stray clients, zero stray admissions, zero
leftover fictional accounts.

---

## 2026-08-05 — Rooms & Beds administration screen (first screen on real Supabase data)

Since the bed-count questions were closed on "staff will enter this themselves", that decision is
now actionable: `src/features/administration/RoomsAndBeds.tsx` lets an authorised user add rooms and
beds for a centre, backed by the real `rooms` and `beds` tables — not the demo file everything else
still runs on.

- Adding a single room creates its one bed automatically (mirrors how Primrose Lodge was seeded).
  A shared room is created empty; its beds (6A, 6B, ...) are added individually, because their count
  and labels are a judgement call, not something to guess.
- `can('rooms.manage')` decides whether the add/edit controls render. That is a courtesy, not the
  control — the database refuses the write regardless of what the button shows, proven below.
- The screen bridges two centre concepts that exist in parallel right now: the group dashboard's
  fictional summary centres (`centres-data.ts`) and the real Supabase centres from
  `useAuth().centres`. Matched by slug for this screen only. The two lists converge once the group
  dashboard itself reads real data — not yet.

**A real gap found while verifying this, not while looking for one:** `rooms` had no audit trigger.
`beds` and `centres` both got one in migration 0009; `rooms` was left off that list by mistake, so
every room change since has gone unrecorded. Fixed in `0021`. Matters more today than a week ago,
since staff will now be making exactly this kind of change themselves.

**Verified end to end**, not just at the database:
- Loaded the live screen: Primrose Lodge showed 16 rooms / 18 beds, matching Supabase exactly.
- Added room "17" through the actual form in the browser → the count became 17 rooms / 19 beds,
  and the row was confirmed present in Supabase with a real timestamp, not merely reflected in
  local UI state.
- The write and the following status update **both now appear in `audit_events`**.
- A fictional helpdesk user (no `rooms.manage`) was refused the same insert — `42501`.
- Test room, test bed and the fictional user were all removed; Primrose Lodge confirmed back at
  16 rooms / 18 beds with zero leftover fictional accounts.

---

## 2026-08-05 — Clinical records, and the privacy rule made real

Six tables: `family_contacts`, `family_meetings`, `detox_records`, `medical_review_requests`,
`safeguarding_records`, `risk_records`. **27 of 34 entities now exist.**

### The indicator/detail split now holds at row level

Until today the restricted flag pointed at nothing. The permission codes existed but there was no
content to protect. Now there is, and RLS gates rows while it cannot gate columns — so:

- the tables require the `*_detail` permission: **no row, therefore no narrative**
- `app.safeguarding_indicator()` / `app.risk_indicator()` are SECURITY DEFINER and return
  **counts and severity only**, gated on `*_indicator`

A counter cannot leak a narrative because it never selects one. The guarantee comes from the shape
of the query, not from remembering to omit a column.

`app.medical_review_summary()` does the same for medical: status, priority and dates for summary
holders; the outcome text is simply never selected.

Both return **zero rather than raising** when the user holds neither permission — an error would leak
the existence of a concern through the failure itself.

### The seven-day rule is now a database constraint

`family_meetings.scheduled_for >= eligible_from`, enforced by CHECK. The brief requires that the API
cannot bypass it, and a constraint is the only thing that holds regardless of the caller.

`eligible_from` is **stamped by `app.create_family_meeting()` from centre settings, never supplied by
the caller** — otherwise the constraint would be decorative, since you could send an earlier
eligibility date alongside an earlier meeting date and satisfy it trivially.

It is stored rather than recomputed on read: if a centre changes its window later, meetings already
booked keep the rule that applied at the time. Recomputing would rewrite history and could
retrospectively make a lawful booking look unlawful.

Closing a meeting without it happening always needs a reason. An early discharge before eligibility
lands there and can never be recorded as complete.

### Verified — 19 assertions

Helpdesk reads **zero** rows from safeguarding, risk, medical and detox · helpdesk **does** get the
safeguarding flag (1, high) and risk flag (1, critical) · therapist reads zero safeguarding rows but
gets the flag and the medical summary · admin reads full detail · meeting on day 3 **refused**, day 8
allowed · completing without an actual time refused · cancelling without a reason refused ·
safeguarding cannot be deleted.

---

## 2026-08-04 — Permission codes restructured, history made undeletable

Stack decision confirmed: **React + TypeScript + Supabase. No Laravel.** The existing build already
follows that architecture, so this and everything after it is extension, not rebuild. Inspection
findings in [ARCHITECTURE_GAP_ANALYSIS.md](ARCHITECTURE_GAP_ANALYSIS.md).

### `0014` — history cannot be deleted

`FOR ALL` write policies include DELETE. Anyone holding `task.complete` could delete a completed
task; anyone holding `room.allocate` could delete an allocation. The audit trigger made that
detectable, not impossible, and the brief prohibits both.

Replaced with explicit INSERT/UPDATE policies, and DELETE revoked outright on `clients`,
`admissions`, `room_allocations`, `client_tasks`, `task_assignments`, `staff_assignments` — so a
policy added by mistake later cannot re-open it. **Verified that even an organisation-wide platform
administrator is refused.**

A related property surfaced while testing: `audit_events.actor_id` references `auth.users`, so a user
whose actions are logged cannot be deleted either. Correct — deactivate via `is_active`, never remove.

### `0014` / `0015` — 40 permission codes, every role remapped

The previous 23 codes could not express *"see the flag, not the narrative"*. A single
`safeguarding.view` is all-or-nothing, so the helpdesk rule the brief demands was literally
unrepresentable. Now split:

| Indicator (level 1) | Detail (level 3) |
|---|---|
| `safeguarding.view_indicator` | `safeguarding.view_detail` |
| `risk.view_indicator` | `risk.view_detail` |
| `medical.view_summary` (2) | `medical.view_detail` |
| `clients.view_operational` | `clients.view_identity` |

Grants rebuilt from empty rather than patched, so nothing survives by accident:
platform_admin 40 · centre_manager 34 · therapist 14 · supervisor 14 · support_staff 11 ·
regional_operations 10 · **helpdesk 7**.

Regional operations deliberately holds no clinical detail — the brief states that regional visibility
must not imply unrestricted access to clinical content.

### Verified — 18 assertions

Admin still sees 10 centres and 20 tasks · admin cannot delete tasks, allocations or clients ·
**helpdesk sees the safeguarding flag and is refused the narrative** · sees the risk flag, refused the
narrative · **sees the client reference, refused the name** · refused medical detail · can still see
tasks · therapist sees names but not safeguarding detail, cannot allocate rooms or manage users ·
helpdesk, support staff and regional operations hold zero clinical-detail grants.

---

## 2026-08-04 — Task system

Converts 16 workbook columns from things the app draws into things it can act on. Ownership, queues,
completion evidence and lateness all become possible for the first time.

### `0011_task_system`

- `task_templates` — per organisation, optionally per centre, so centres can run different schedules.
- `client_tasks` — **`due_at` and `completed_at` are separate columns and neither may substitute for
  the other.** That is the whole point: the whiteboard holds one value per action, which is why
  lateness is unmeasurable in it.
- `task_assignments` — reassignment closes one row and opens another, so "who was responsible on the
  day" survives the reassignment.
- Title and description are **copied** from the template at generation. A template edited next year
  must not silently rewrite what a task said when someone completed it.
- `source_value` keeps the workbook cell verbatim beside `source_interpretation`, so a reading of `X`
  can be revisited without going back to the spreadsheet.

**Deviation from the brief, recorded deliberately:** the brief lists `overdue` as a status. It is not
stored. Overdue is derived from `due_at` against `now()`, because a stored flag needs a job to keep it
true and is silently wrong between runs. Also in DECISIONS.

Constraints the spreadsheet cannot enforce, now enforced: completing requires a timestamp; a
non-completed task cannot carry one; cancelling requires a reason; not-applicable requires a reason.

### `0012_task_generation`

Due-date computation and generation in the trusted layer, mirroring `src/domain/tasks.ts`. The
duplication is deliberate — the browser previews and sorts, the database enforces — but the two must
agree, and DST is where they would most easily diverge. Both follow one rule: days/weeks are calendar
arithmetic on the centre's wall clock, hours are elapsed on the instant.

Moving the planned discharge date now recalculates open discharge-based deadlines **automatically via
trigger**, and never touches a completed one. That is precisely the failure the workbook shows: its
pre-discharge dates were hand-computed and stayed put when one client's discharge moved 29 days.

### `0013_seed_task_templates` — 20 templates

**Three were absent from the product entirely until now**: `side_assignment` (col R, never built),
`detox_review` (col U, extracted then dropped), `doctor_assessment` (col AG). Side assignment carries
a *topic* rather than a status, so it requires a completion note.

### Verified — 15 assertions

Generation (20 tasks, idempotent on re-run) · 24-hour contact as elapsed time · week offsets as
calendar days · pre-discharge at discharge − 24h · manual basis leaves `due_at` null rather than
guessing · **DST parity: +4 weeks from 20 Oct 14:00 BST yields 17 Nov 14:00 GMT in SQL, matching the
TypeScript test exactly** · elapsed rules stay elapsed across the same boundary · discharge change
moves open deadlines · completed deadlines untouched · all four status constraints refuse · tasks
audited.

---

## 2026-08-04 — Audit history and staff assignments

Starting on the gap list. These two first because audit cannot be backfilled, and assignments unblock
workload, filtering and accountability.

### `0009_audit_events` — append-only audit

The largest single gap in the build: §23 requires it, §33 lists it as acceptance, and it did not
exist. Everything changed before today is unreconstructable.

- Records actor, action, record type and id, centre, timestamp, previous and new values, and reason.
- **Only the fields that actually changed** are stored on UPDATE. Whole-row snapshots bury the change
  and duplicate sensitive content on every touch.
- No-op updates write nothing, so the log stays signal.
- `reason` comes from `set_config('app.change_reason', …)`, which is how the workflows that require a
  reason will supply one.
- Attached to clients, admissions, room_allocations, access assignments, user profiles, beds, centres.

**Append-only is enforced twice.** No UPDATE/DELETE policy exists *and* those privileges are revoked,
so a policy added by mistake later cannot re-open them. INSERT is revoked too — the trigger is
SECURITY DEFINER and writes on the user's behalf, otherwise a user could forge an entry attributing
an action to someone else.

Verified (9 assertions): insert recorded · update records changed field only · no-op writes nothing ·
reason captured · centre captured · admin can read · **UPDATE, DELETE and direct INSERT all refused**
to a platform administrator.

### `0010_staff_assignments` — therapist, buddy and doctor as records

Previously strings on a card, which made filtering by therapist, real workload, and assignment
history all impossible.

- One live assignment per role per admission, enforced by a partial unique index. Replacing a
  therapist means ending one row and opening another, which is what preserves the history.
- Zero-length assignments rejected.
- Indexed for "how many clients does this therapist hold right now".

**A finding while building this.** One of the six buddy values in the workbook is *also the name of a
client on the same board*, and all buddy values are first names only. That points to buddies being
peer clients rather than staff — so the table does not guess. `assignee_kind` is `staff`, `peer` or
`unresolved`, and imported rows stay visible as a plain name until confirmed. Modelling a client as
staff would put them in workload figures and imply an account they should not have. New question Q41.

Verified (10 assertions): unresolved import by name · staff assignee · peer buddy · staff-and-peer
rejected · self-buddy rejected · two live therapists rejected · zero-length rejected · handover keeps
both rows · exactly one live therapist after handover · assignments audited.

**Next:** task_templates + client_tasks, which converts 16 workbook columns from display into records.

## 2026-08-03 — Clients, admissions and bed allocation (schema applied and proven)

**Applied** — `0004_clients_and_admissions`, `0005_room_allocations`.

- `clients` — permanent record, separate from any stay, with a stable `reference`. The workbook has
  no identifier at all, so it cannot tell two people of the same name apart or recognise a return.
- `admissions` — three distinct discharge dates: `original` (immutable), `current` (changeable with a
  reason), `actual`. Directly answers the 28-day-plan / 57-day-stay row.
- `room_allocations` — append-only history with a `tstzrange` occupancy window. Transfers end one row
  and open another; nothing is ever overwritten or deleted.

**Constraints verified against the live database.** Seven cases run in a transaction, then cleaned up:

| Test | Result |
|---|---|
| Allocate a free bed | ✅ accepted |
| **Double-book the same bed (overlapping)** | ✅ **refused** — `exclusion_violation` |
| **Allocate into another centre's bed** | ✅ **refused** — `foreign_key_violation` |
| Same-instant handover (out 14:00, in 14:00) | ✅ accepted |
| **Rewrite `original_planned_discharge_date`** | ✅ **refused** — `check_violation` (BR-8) |
| Second open admission for one client | ✅ **refused** — `unique_violation` |
| Mark discharged with no discharge time | ✅ **refused** — `check_violation` |

Double-booking is prevented by an `EXCLUDE USING gist` constraint, not application logic. The
difference shows under concurrency: two admissions racing for the last bed cannot both succeed, which
is exactly what a read-then-write check in application code permits.

Post-test state confirmed clean: 1 org, 1 centre, 16 rooms, 18 beds, 0 clients, 0 admissions,
0 allocations. Security linter: no warnings; only the expected `rls_enabled_no_policy` notices on all
9 tables, which is deny-all behaving correctly until the access model lands.

**Acceptance criteria now met** — "double-booking is prevented", "the room is released after
discharge" (allocation windows close), "cross-centre access requires assignment" (structurally
impossible at the allocation level).

**Not done** — RLS policies, task tables, photographs, audit_events, UI wiring to real data.

## 2026-08-03 — Confirmed: the whiteboard is missing a bed space

**Q39 answered — Primrose Lodge has 19 bed spaces. The whiteboard tracks 18.**

Recorded as a finding rather than a correction, because the gap has real operational consequences:

- The 19th bed cannot be allocated — it is never offered at admission and never shows as available,
  so capacity has been understated by one bed permanently.
- If it has ever been occupied, that client had no tracked family contacts, milestones or discharge
  actions, and nothing would have flagged it. The board cannot detect a row that was never added.
- Every occupancy figure from this board has been wrong. `8 of 18 (44%)` is really `8 of 19 (42%)`.

The spreadsheet cannot surface this on its own: it has no notion of how many beds *should* exist, so
a missing row is indistinguishable from a correct one.

**New question Q40** — *which* bed is missing: a 17th room, or a third shared room splitting A/B?
Until answered the seed keeps the 18 the workbook evidences. Inventing a 19th label would be the
worse error: it would read as authoritative, get allocated against, and disagree with the building.

**No code changes required.** Rooms and beds were never hard-coded, so this is data entry — the
argument for that design arriving sooner than expected.

Updated: WORKBOOK_REVIEW §2, OPEN_QUESTIONS Q39/Q40, seed.sql header.

## 2026-08-03 — Brand palette applied

Base colours supplied by the client: `#dc61b0` pink, `#77499f` purple, `#97cae6` blue.

Roles were assigned from measured contrast and hue separation rather than preference:

| Colour | Contrast on white | Hue | Nearest status hue | Role |
|---|---|---|---|---|
| `#77499f` purple | **6.49:1** — passes body text | 272 | red, 92° away | **Primary accent** — all interactive |
| `#dc61b0` pink | 3.29:1 — fails body text | 321 | red, **43° away** | Chrome only, large sizes only |
| `#97cae6` blue | 1.76:1 — fails everything | 201 | green, **40° away** | Decorative fills only |

**Decisions**

- **Purple is the accent**, not pink. It is the only base colour that both passes body-text contrast
  and stays clear of every semantic hue.
- **Pink never appears as a status.** At 43° from alert red and unable to carry small text, a pink
  chip beside a red "overdue" chip is a misread waiting to happen on a card glanced at for half a
  second. It lives in the sidebar — active-nav bar and icon — where no status colour is ever drawn.
- **Blue marks available beds.** Availability needs no action, so a 9% blue wash reads "ready"
  without competing with amber and red. Blue fails text thresholds, which is exactly why it is a
  fill and a border here, with `--brand-blue-ink` (`#337093`, 5.4:1) for the few words.
- **Alerts moved from rose to red** (hue ~0 rather than ~350) purely to buy hue distance from pink.
- Chrome is `#2b1c3d`, a deep purple derived from the brand — white text at 15.7:1, and the right
  home for the supplied white logo.
- All three colours appear together in exactly one place: a decorative gradient behind the logo.

**Two bugs found and fixed during verification**

- A PowerShell find/replace over the component files double-encoded every non-ASCII character
  (`—` → `â€"`, `✓` → `âœ“`). Both files were rewritten properly; Windows PowerShell 5.1's
  `Get-Content -Raw` → `Set-Content` round-trip is not UTF-8 safe and was the wrong tool.
- `bg-[color-mix(…)]` silently rendered nothing: Tailwind read the value as a background-*image*.
  Fixed with the explicit `bg-[color:…]` type hint. The border worked all along, which is what made
  it look like a colour problem rather than a parsing one.

**Verified** — typecheck clean, 100 tests passing, no console or server errors after the fix, all
three brand variables resolving, 18 cards (8 occupied / 10 available), pink active marker confirmed
`rgb(220, 97, 176)`, no mojibake.

## 2026-08-03 — Room board UI (development preview)

First screen. Runs at `http://localhost:3100` (`npm run dev` in `treatment-ops/`).

**Built**

- App shell: dark chrome sidebar + light/dark content area, collapsible nav, 10 destinations grouped
  Centre / Work / Oversight. Only Room board is real; the rest say `soon` and render an honest empty
  state rather than a fake screen.
- Room board: all 18 bed spaces, 8 occupied / 10 available, shared beds labelled 6A/6B and 9A/9B.
- 7 summary tiles, 6 of them clickable as filters and kept in sync with the filter pills.
- Search across bed, client, reference, therapist and buddy.
- Client detail panel: facts plus the full action list with **due date and completion shown
  separately** — the thing the spreadsheet structurally cannot do.
- Brand: Primrose Lodge logo from `cdn.ukat.co.uk`, downloaded and served locally rather than
  hot-linked. It is a white mark, which is why the app chrome is dark.

**Design decisions**

- Room cards carry no clinical content at any permission level. Substance, detox, medical and
  safeguarding are absent; a restricted alert is a flag with detail behind the client file.
- Status is always icon + text, never colour alone.
- Accent is a teal deliberately distant in hue from amber and rose, so brand can never read as
  warning or overdue.
- `Past discharge` became its own tile and card state after a fixture surfaced "Day 45 of 28" — the
  workbook's real 28-day-plan / 57-day-stay anomaly. It looked like a rendering bug; it is in fact
  the condition the whiteboard hides, so the UI now names it.

**Verified** — typecheck clean, 100 tests still passing, no console or server errors, logo loads
(294×141), filter click confirmed narrowing 18 → 6 beds with tile and pill in sync.

**New open question** — primroselodge.com states **19 ensuite bedrooms**; the whiteboard has 16 rooms
/ 18 bed spaces. Which is authoritative, and is a bed space missing from the board? Added to
OPEN_QUESTIONS.

**Still needed** — official brand hex values, and a dark-text logo variant if the chrome is ever to
go light.

## 2026-08-03 — Database created and schema applied

**Supabase project** — `treatment-ops-dev`, London (`eu-west-2`), ref `ygustqrxjaqfbdjftcmq`, free
plan. Created after `pricing-ledger` was paused to free a project slot. **Development only,
fictional data only**; production will be a separate, clean project (D-016).

**Applied and verified**

- `0001_extensions` — pgcrypto, btree_gist, `app` schema, shared `updated_at` trigger
- `0002_org_hierarchy` — organisations, zones, centres, rooms, beds; RLS enabled **and forced** on
  all five in the same migration that creates them
- `0003_harden_function_and_extension` — resolved both linter warnings (below)
- Seed — Primrose Lodge: **16 rooms / 18 beds**, bed order
  `1, 2, 3, 4, 5, 6A, 6B, 7, 8, 9A, 9B, 10, 11, 12, 13, 14, 15, 16`, matching the whiteboard exactly

**Security findings, both fixed in 0003**

- `function_search_path_mutable` on `app.touch_updated_at` — an unpinned `search_path` resolves
  schemas using the *caller's* configuration, so a caller could shadow a referenced object and have
  their version run in the function's context. Now `set search_path = ''`, `security invoker`, and
  every reference schema-qualified.
- `extension_in_public` — `btree_gist` was installed in `public`, the schema PostgREST exposes.
  Moved to `extensions`.

Linter re-run: clean. Five `rls_enabled_no_policy` notices remain and are **intentional** — RLS
forced with zero policies means the tables deny everything until the access model exists.

**Corrected from the previous entry** — the SQL is no longer unapplied. Migration files on disk were
synced to match what actually ran (a tautological check constraint was dropped, and the `revoke` in
0001 simplified).

**Not done** — no RLS policies, no clients/admissions/tasks schema, no UI.

## 2026-07-31 — Phase 1 (partial): domain layer built and tested

Local-only, per instruction. Supabase project, GitHub repository and hosting all remain undecided,
and nothing built here assumes any of them.

**Added** — `treatment-ops/`, a self-contained directory ignored by the parent repo so it can be
lifted into its own repository once Q1 is settled.

- `src/domain/zoned-time.ts` — timezone-safe instant arithmetic, no dependencies
- `src/domain/centre-settings.ts` — per-centre configuration; Primrose Lodge as data
- `src/domain/discharge.ts` — BR-7/8/9/10, plus import reconciliation of duration vs discharge date
- `src/domain/tasks.ts` — BR-10/11/12/13: due-date bases, overdue derivation, recalculation
- `src/domain/eligibility.ts` — BR-19/20/21: family-meeting eligibility
- **100 tests, all passing**; `tsc --noEmit` clean under `strict`, `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`
- `supabase/migrations/0001_extensions.sql`, `0002_org_hierarchy.sql`, `supabase/seed.sql`
  — **written but not applied** (no Docker on this machine)

**Verified by test**

- Discharge inclusive/exclusive of the admission day is configuration, not a code path (D-015/Q3)
- The +29-day workbook anomaly reconstructs as `probable_extension` with the original plan inferred
- Calendar offsets preserve the wall clock across the BST/GMT boundary; a naive
  `+28 × 86 400 000 ms` is demonstrated to land an hour early and, near midnight, a **day** early
- Elapsed-hour rules (24-hour contact, 168-hour eligibility) stay elapsed across the same boundary
- Overdue is exclusive at the due instant and false for every terminal status
- Recalculation never touches completed, cancelled or not-applicable tasks
- Family meetings are rejected one millisecond before eligibility and never fabricated as complete

**Not done** — no RLS policies, no application UI, no schema actually executed against a database.

**Blocked** — Docker Desktop + Supabase CLI are not installed, so no migration has been run.

## 2026-07-31 — Phase 0: discovery and workbook analysis

**Added**

- Full structural analysis of `Whiteboard .xlsx` (not committed; git-ignored)
- Documentation set: `PRODUCT_OVERVIEW`, `WORKBOOK_REVIEW`, `REQUIREMENTS`, `TERMINOLOGY`,
  `PERMISSIONS_MATRIX`, `DATA_MODEL`, `BUSINESS_RULES`, `WORKFLOWS`, `IMPORT_MAPPING`,
  `SECURITY_MODEL`, `SUPABASE_SETUP`, `DECISIONS`, `OPEN_QUESTIONS`, `BACKLOG`, `TEST_PLAN`,
  `DEPLOYMENT_NOTES`, `CHANGELOG`
- `.gitignore` hardened against committing workbooks, extracted media and client photographs

**Findings**

- 1 worksheet, 34 columns, 18 bed-space rows, 311 populated cells, no formulas, no legend
- Room configuration confirmed: 14 single + 6A/6B + 9A/9B = **18 beds across 16 rooms**;
  8 occupied / 10 vacant at the workbook's last save (2026-07-21)
- 8 embedded client photographs as floating drawings; anchor rows are **off by one** against the
  client rows, so position cannot be trusted to link photo to client
- The client-name column (C) has **no header**, and there is no client identifier anywhere
- 14 columns mix dates, `TRUE`, `X`/`x` and blanks in the same column — no way to express
  "due Monday, done Wednesday"
- Duration is in days (28 ×7, 10 ×1); `discharge = admission + duration − 1` holds for 6 of 8 rows
- One client shows a 57-day stay against a 28-day duration — an apparent extension with no record of
  the original plan
- `24h prior to leaving` equals `discharge − 1 day` in 5 of 6 date-valued rows, computed by hand and
  therefore not recalculated when a discharge date moves
- 21 data-quality findings, incl. five date formats in use and ~60% of date cells carrying no year
- Column AG (doctor review list) is entirely empty and hard-codes "Thursday" in its header
- The seven-day family-meeting rule is **not evidenced** in the workbook — it is a stated requirement

**Decisions** — D-001 … D-020 (see [DECISIONS.md](DECISIONS.md)). Notably: bed-level allocation;
double-booking prevented by a database exclusion constraint; `due_at`/`completed_at` always separate;
`original_planned_discharge_date` immutable; photographs **not** auto-imported; audit append-only and
excluding level-3 content; platform administrator has no implicit clinical read.

**Open** — Round 1 questions Q1–Q8; Rounds 2–5 deferred. See [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md).

**Not done** — no application code, no migrations, no schema. Phase 1 is blocked on Q1 (repository
and Supabase project).
