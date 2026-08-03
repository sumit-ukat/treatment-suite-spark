# Test Plan

**Status:** specification. No tests written yet (no application code exists).
Tooling: Vitest + Testing Library (already in the repo), plus integration tests executing SQL against
a local Supabase stack as each role's JWT.

**Fictional data only.** No real client name, photograph or workbook content in any fixture. The
supplied workbook is git-ignored and must never become a test asset.

---

## 0 · Testing principle

Permission tests must run **against the database as the role**, not against mocked application code.
A test that asserts "the component didn't render the field" proves nothing about an attacker calling
the API. Every row in [PERMISSIONS_MATRIX.md](PERMISSIONS_MATRIX.md) becomes an integration test that
signs in as that role and issues a real query, asserting **zero rows** where access is denied.

---

## 1 · Acceptance criteria — first usable Primrose Lodge version

Each line is a test.

| # | Criterion |
|---|---|
| A-01 | A user can authenticate and is routed by scope |
| A-02 | Primrose Lodge exists with 16 rooms / 18 beds incl. 6A, 6B, 9A, 9B |
| A-03 | Rooms and beds are configurable without code changes |
| A-04 | A fictional client can be created and receives a unique reference |
| A-05 | That client can be admitted to a selected centre |
| A-06 | A photograph can be uploaded (private bucket, unverified) |
| A-07 | A different authorised user can verify it; verifier and time are recorded |
| A-08 | Only available beds in the selected centre are offered |
| A-09 | Double-booking is rejected **by the database** |
| A-10 | Focal therapist can be assigned |
| A-11 | Buddy can be assigned |
| A-12 | Treatment duration can be entered |
| A-13 | Expected discharge is calculated per BR-7 |
| A-14 | Admission generates tasks from templates with correct due dates |
| A-15 | `due_at` and `completed_at` are separate and independently observable |
| A-16 | Tasks appear in the correct role and user queues |
| A-17 | Overdue tasks are visible and correctly derived |
| A-18 | The room board shows live occupancy |
| A-19 | A change in the client file is reflected on the dashboard |
| A-20 | Four distinct family-contact tasks are created |
| A-21 | A family meeting cannot be booked before eligibility — **including via direct API** |
| A-22 | Planned discharge can be changed with a reason; original preserved |
| A-23 | Early discharge can be recorded through the workflow |
| A-24 | Future tasks are reconciled with reasons, never deleted |
| A-25 | The bed is released at actual discharge |
| A-26 | A centre manager sees only assigned centres |
| A-27 | A therapist sees only per Q6 |
| A-28 | Helpdesk cannot read any level-3 content |
| A-29 | A supervisor sees all assigned centres and can switch views |
| A-30 | Regional management sees assigned-centre summaries |
| A-31 | Significant actions appear in the audit log |
| A-32 | No real workbook data in any fixture (asserted by a repo scan) |
| A-33 | The build produces a portable Node server with no Vercel dependency |

---

## 2 · Authentication and permissions

Login · logout · disabled account denied · **centre isolation** (user at A gets zero rows for B) ·
zone isolation · regional scope resolves to the right centres · therapist scope · helpdesk
restrictions · support-staff restrictions · centre-manager restrictions · supervisor scope ·
**administrator has no clinical read** · read-only assignment blocks all writes · temporary access
works within window · **expired access returns zero rows with no job having run** · revoked access
takes effect immediately · a user with multiple roles gets the union of scopes but per-centre verbs ·
a denied attempt writes `audit_events` with `outcome = 'denied'`.

## 3 · Rooms and beds

Availability query · shared-room allocation (6A occupied, 6B still offered) · **double-booking
rejected by the exclusion constraint, including two concurrent transactions** · cross-centre
allocation rejected by FK · transfer ends the old allocation and opens a new one · both rows survive ·
`ends_at` set at discharge · closed and maintenance beds not offered · a numeric-looking label (`1`)
and a text label (`6A`) behave identically.

## 4 · Tasks

Generation at admission · due-date calculation for each basis (admission, planned discharge, actual
discharge, prior-task completion, manual) · offsets in hours/days/weeks · overdue derivation at the
boundary (`due_at = now()` is **not** overdue; one second later it is) · completion sets
`completed_at` and **leaves `due_at` untouched** · reopening · cancellation without a reason is
rejected · not-applicable without a reason is rejected · assignment history preserved · unassigned
queue by role · escalation creation and routing.

## 5 · Family rules

24-hour contact due exactly `admitted_at + 24h` · week-1 and week-2 offsets · pre-discharge =
`planned_discharge − 24h` · **recalculation when the discharge date moves** · completed contacts are
**not** recalculated · seven-day eligibility at the boundary (168h − 1s rejected, 168h accepted) ·
**API bypass attempt with an earlier date is rejected and audited** · admission-date change moves
eligibility · early discharge before eligibility marks the meeting cancelled/not-applicable with a
reason and never complete · the seven-day rule does not affect the 24-hour contact.

**Timezone:** an admission at 23:30 BST — the 24-hour deadline must land at 23:30 the next day in
centre time, not 22:30 or 00:30. A 28-day admission spanning the BST→GMT change on the last Sunday of
October must still be 28 calendar days, not 28 × 86,400 seconds. This is a real correctness risk for
a service whose standard stay is four weeks.

## 6 · Discharge

Planned-date change requires a reason · `original_planned_discharge_date` cannot be updated (trigger
raises) · extension case · early-discharge initiate → approve → finalise · **approver must differ
from initiator** · outstanding-task reconciliation · completed tasks untouched · bed released ·
snapshots written · audit events for every step · a partially-failed finalisation rolls back entirely.

## 7 · Photographs

Accepted types (jpeg/png/webp) · rejected type · **file with a valid extension but wrong magic bytes
is rejected** · size limit · EXIF stripped · upload permission enforced · view permission enforced ·
verification by a different user · verification permission enforced · replacement deactivates the
previous row and keeps it · **direct bucket access without a signed URL fails** · a signed URL for a
client outside scope cannot be minted · a signed URL expires.

## 8 · Sensitive information

Helpdesk query on `safeguarding_records.summary` returns **zero rows** · same for therapy notes,
detox and medical detail · helpdesk *does* see the restricted indicator · no dashboard query returns
a level-3 field · no export includes level-3 content without permission · **`audit_events` contains
no safeguarding narrative** · application logs contain no level-3 content (asserted by scanning
captured log output during an integration run) · unauthorised centre access denied and recorded.

## 9 · Import

Vacant room-only row creates a bed and **no client** · client row creates client + admission ·
`TRUE` maps to completed-without-date and is flagged · a date maps per the confirmed per-column
choice · `X` and `x` treated identically once mapped · blank does not become "not applicable" by
default · malformed `3//8` flagged, not imported as a date · duplicate name with overlapping dates
prompts · duplicate name with non-overlapping dates offers a returning-client link · unheadered
column C can be mapped · trailing-space values (`9B `, `Alcohol `) normalise on match while the
original is preserved · duration/discharge mismatch produces the right warning class ·
`import_source_values` written for every cell · import cancellation leaves no partial data ·
import job audited.

## 10 · Non-functional

Dashboard < 2 s for a 20-bed centre · task queues at 10,000 rows · **RLS helper called once per query,
not per row** (assert via `EXPLAIN`) · keyboard navigation through the admission wizard · screen-reader
labels · **no status conveyed by colour alone** · 768 px tablet layout · loading/empty/error states ·
error messages leak nothing sensitive.

## 11 · Repository hygiene (CI)

- No `.xlsx` file tracked in git
- No file matching `Whiteboard*` tracked
- No `service_role` string in any client bundle
- No `.env*` tracked
- Every sensitive table has an audit trigger
- Every table has RLS enabled **and forced**
