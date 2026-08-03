# Workbook Review — `Whiteboard .xlsx`

**Status:** Phase 0 discovery, complete
**Reviewed:** 2026-07-31
**Source file:** `C:\Users\Bilal\Downloads\Whiteboard .xlsx` (580,466 bytes, last saved **2026-07-21 13:49**)
**Source file location in repo:** none — the workbook is deliberately *not* copied into the repository. See [SECURITY_MODEL.md](SECURITY_MODEL.md).

> **Sanitisation notice.** This document describes the *structure* of the workbook. It contains no
> client names, no photographs, no safeguarding narratives and no medical text. Where a column holds
> personal or sensitive content, only counts, value-kinds and field lengths are reported. All
> illustrative examples elsewhere in the documentation are fictional.

---

## 1. Physical structure

| Property | Value |
|---|---|
| Worksheets | **1** — `Sheet1` (visible) |
| Used range | A1:AH19 (34 columns × 19 rows) |
| Populated cells | 311 |
| Header row | Row 1 (33 of 34 columns carry a header) |
| Data rows | Rows 2–19 = **18 rows**, one per bed space |
| Embedded images | **8** PNGs (`xl/media/image1–8.png`, 24 KB – 102 KB) |
| Formulas | **none** — every cell is a literal value |
| Defined names | none |
| Threaded comments | none (`person.xml` present but empty) |
| Data validation / conditional formatting | none |

There is no legend, no key, no notes sheet and no documentation of conventions anywhere in the file.
Every convention described below has been inferred from the values themselves and **requires
confirmation**.

---

## 2. Room configuration (confirmed)

Column D (`Room No.`) is populated for all 18 data rows — including vacant ones. This is the
authoritative room list and it matches the brief exactly.

| Row | Room label | Cell type | Occupied at last save |
|---|---|---|---|
| 2  | `1`   | number | ● yes |
| 3  | `2`   | number | ○ vacant |
| 4  | `3`   | number | ● yes |
| 5  | `4`   | number | ● yes |
| 6  | `5`   | number | ● yes |
| 7  | `6A`  | text   | ○ vacant |
| 8  | `6B`  | text   | ○ vacant |
| 9  | `7`   | number | ● yes |
| 10 | `8`   | number | ○ vacant |
| 11 | `9A`  | text   | ○ vacant |
| 12 | `9B ` | text   | ○ vacant — **note trailing space** |
| 13 | `10`  | number | ● yes |
| 14 | `11`  | number | ○ vacant |
| 15 | `12`  | number | ○ vacant |
| 16 | `13`  | number | ○ vacant |
| 17 | `14`  | number | ○ vacant |
| 18 | `15`  | number | ● yes |
| 19 | `16`  | number | ● yes |

**Totals: 18 bed spaces = 14 single rooms + 2 shared rooms × 2 beds (6A/6B, 9A/9B).**
Occupancy at last save: **8 of 18 (44%)**.

> ### ⚠ The whiteboard is missing a bed space
>
> **Confirmed 2026-08-03: Primrose Lodge has 19 bed spaces, not 18.** The board tracks 18.
>
> This is the most consequential single finding in the review, and it is invisible from inside the
> file — the spreadsheet has no way to state how many beds *should* exist, so a missing row looks
> exactly like a correct one.
>
> Three consequences follow:
>
> 1. **A bed that is not on the board cannot be allocated.** It is not offered at admission and does
>    not appear as available, so capacity is understated by one bed, permanently.
> 2. **If that bed has ever been occupied, a client has been untracked** — no family contacts, no
>    milestones, no discharge actions, no evidence of any of it. Nothing would flag this, because the
>    board has no concept of the row's absence.
> 3. **Every occupancy figure ever reported from this board has been wrong.** The 8-of-18 above is
>    really 8 of 19: 42%, not 44%.
>
> Which bed is missing is [Q40](OPEN_QUESTIONS.md) — either a 17th room, or a third shared room
> splitting into A/B. Until answered, the seed holds the 18 the workbook evidences rather than a
> guessed 19th, because inventing a bed label would be a worse error than being one short.
>
> Note that no code changes are needed either way. Rooms and beds are configuration, so this is data
> entry — which is the argument for that design, arriving sooner than expected.

Two structural facts follow directly:

- Room identifiers are **mixed-type** — 14 are stored as numbers, 4 as text. Any import or model
  must treat the room label as a **string**, never a number. (`1` and `"1"` must not diverge.)
- A shared room is represented as **two independent rows**, i.e. the sheet already models the
  *bed space*, not the room. The product should do the same: `rooms` → `beds`, with the bed as the
  allocatable unit. Room `6` has no row of its own; only `6A` and `6B` exist.

---

## 3. Vacant-row shape (confirmed)

The ten vacant rows are not blank. Each carries exactly **four** values — columns **D** (`Room No.`),
**H** (`Peeps`), **V** (`Family Vist`) and **AE** (`GP Summary`) — the latter three being `FALSE`.
Row 17 (room `14`) additionally holds a 1-character stray value in column AF.

This matters for import: **a row is a client row if and only if column C is populated**, not if the
row has any content. Using "row has data" as the test would import ten phantom clients whose
`Peeps`, `Family Visit` and `GP Summary` all read `FALSE`.

`FALSE` on a vacant room is meaningless — there is no client for the flag to describe. This is
direct evidence that `FALSE` in this workbook means **"empty cell that happens to be a checkbox"**,
not "action not required" or "action not done".

---

## 4. Column inventory

Headers are reproduced verbatim, including their typos and trailing spaces.

| Col | Header (verbatim) | Populated (rows 2–19) | Value kinds observed | Product concept (inferred) |
|---|---|---|---|---|
| A  | `Photo` | 1 (junk) | 53 spaces in row 4 | Placeholder for the floating images — see §5 |
| B  | `Admission Date ` | 8 | date | `admissions.admitted_at` |
| C  | *(no header — a single space)* | 8 | text | **Client name** — see §6 |
| D  | `Room No. ` | 18 | number ×14, text ×4 | `beds.label` |
| E  | `Focal Therapist ` | 7 | text (5 distinct) | `staff_assignments` role=focal_therapist |
| F  | `Substance ` | 8 | text (3 distinct → 2 real) | `admissions.primary_substance` |
| G  | `Buddy ` | 8 | text (6 distinct) | `staff_assignments` role=buddy |
| H  | `Peeps ` | 18 | boolean | PEEPs — term unconfirmed, see [TERMINOLOGY.md](TERMINOLOGY.md) |
| I  | `24hr Family Contact ` | 8 | boolean (all `TRUE`) | Task template — family contact @ +24h |
| J  | `1st week Contact ` | 8 | date ×2, boolean ×6 | Task template — family contact, week 1 |
| K  | `2nd week Contact ` | 8 | date ×3, boolean ×4, `x` ×1 | Task template — family contact, week 2 |
| L  | `24h prior to leaving` | 8 | date ×6, boolean ×2 | Task template — pre-discharge family contact |
| M  | `7 day staisfaction Survey ` *(sic)* | 8 | date ×4, boolean ×4 | Task template — satisfaction survey @ +7d |
| N  | `Life Story /Surrender ` | 8 | date ×2, boolean ×6 | Treatment milestone |
| O  | `Step 1 ` | 8 | date ×4, boolean ×4 | Treatment milestone |
| P  | `Step 2 ` | 8 | date ×4, boolean ×3, `x` ×1 | Treatment milestone |
| Q  | `Step 3 ` | 7 | date ×5, boolean ×1, `x` ×1 | Treatment milestone |
| R  | `Side Assisgnment ` *(sic)* | 3 | text | Milestone **with a topic** — see §7 |
| S  | `CCP ` | 8 | date ×6, `3//8` ×1, boolean ×1 | Unknown — see TERMINOLOGY |
| T  | `Group` | 7 | text — `A` ×6, `B` ×1 | `admissions.treatment_group` |
| U  | `Detox ends ` | 7 | date ×3, `X`/`x` ×3, boolean ×1 | `detox_records.expected_end` |
| V  | `Family Vist ` *(sic)* | 15 | boolean (1 × `TRUE`) | `family_meetings` — see §8 |
| W  | `Intro CP/121` | 8 | date | Weekly session — unknown term |
| X  | `Week 1 CP/121` | 8 | date | Weekly session |
| Y  | `Week 2 CP/121` | 8 | date ×7, `x` ×1 | Weekly session |
| Z  | ` Week 3 CP/121` | 8 | date ×6, `X`/`x` ×2 | Weekly session |
| AA | `Week 4 CP/121` | 8 | date ×6, `X`/`x` ×2 | Weekly session |
| AB | `Treatment duration ` | 8 | number — `28` ×7, `10` ×1 | `admissions.planned_duration_days` |
| AC | `Discharge Date ` | 8 | date | `admissions.planned_discharge_date` |
| AD | `Doctor ` | 7 | text (3 distinct) | `staff_assignments` role=doctor |
| AE | `GP Summary ` | 18 | boolean | Task — GP summary issued |
| AF | `Safeguarding /Risks/ Concens` *(sic)* | 9 | free text, 1–103 chars | `safeguarding_records` / `risk_records` |
| AG | `List of client to see doctor on Thursday and reason of assessment ` | **0** | — | `medical_review_requests` — see §9 |
| AH | *(no header)* | 1 | `/` in row 2 | Junk |

---

## 5. Photographs (confirmed)

The eight PNGs are **floating drawing objects**, not cell contents. Column A (`Photo`) is empty apart
from one cell of whitespace. Each image is a `oneCellAnchor` — anchored to a top-left cell with a
pixel offset and a fixed size, free to overlap rows beneath it.

Anchored at (1-based) rows: **2, 3, 4, 5, 8, 12, 17, 18**.
Occupied data rows: **2, 4, 5, 6, 9, 13, 18, 19**.

The counts match (8 = 8) but the row indices **do not**. Seven of the eight anchors sit exactly one
row above an occupied row; one coincides. So the photographs visually cover the correct clients on
screen, but their anchor row cannot be trusted as the client key.

> **Import consequence.** Photo-to-client association cannot be read off the anchor row. It must be
> resolved by computing each image's vertical extent from `rowOff` + the image height against the
> cumulative row-height map, then matching to the row the image *centre* falls within — and the
> result must be shown to a human for confirmation before import. This is the single most error-prone
> part of the import, and attaching the wrong photograph to the wrong client is a serious
> misidentification risk. **Recommendation: do not auto-import photographs in v1.** Import the
> client rows, then have staff upload and verify photographs through the normal workflow.

The images are real client photographs. They have not been opened, are excluded by `.gitignore`, and
must never appear in fixtures, tests, seed data or screenshots.

---

## 6. The unnamed client column (confirmed)

Column **C has no header** — the cell contains a single space character. It holds the client's name
and is populated in exactly the 8 occupied rows.

This is not cosmetic. It means the workbook's single most important identifier is the one field with
no label, and any header-driven import will silently drop it. The import mapper must support mapping
an *unheadered* column, and header detection must not assume every column has a name.

There is **no client reference number anywhere in the workbook.** The name is the only identifier,
so the sheet cannot distinguish two clients with the same name, and cannot recognise a returning
client. The product introduces a stable `clients.reference` for exactly this reason.

---

## 7. Status-value semantics — the central ambiguity

Fourteen columns (J–S, U, Y–AA) mix **dates, booleans and the letter X in the same column**. This is
the most consequential finding in the review, because the same column is being used to answer two
different questions at once:

- a **date** → *"this happened / is booked for this day"*
- `TRUE` → *"this is done"* (but with no date)
- `X` / `x` → *"this is done"*? *"not applicable"*? *"see me"*? — unknown
- `FALSE` → almost certainly *"nothing recorded"*, given it appears on vacant rooms (§3)
- **blank** → *"nothing recorded"*, or *"not applicable"*, or *"not yet due"*

Observed distribution across the eight client rows:

| Column | dates | `TRUE` | `X`/`x` | blank |
|---|---|---|---|---|
| `24hr Family Contact` | 0 | 8 | 0 | 0 |
| `1st week Contact` | 2 | 6 | 0 | 0 |
| `2nd week Contact` | 3 | 4 | 1 | 0 |
| `24h prior to leaving` | 6 | 2 | 0 | 0 |
| `7 day staisfaction Survey` | 4 | 4 | 0 | 0 |
| `Life Story /Surrender` | 2 | 6 | 0 | 0 |
| `Step 1` | 4 | 4 | 0 | 0 |
| `Step 2` | 4 | 3 | 1 | 0 |
| `Step 3` | 5 | 1 | 1 | 1 |
| `CCP` | 6 | 1 | 0 | 0 (+1 malformed `3//8`) |
| `Detox ends` | 3 | 1 | 3 | 1 |
| `Week 2–4 CP/121` | 19 | 0 | 5 | 0 |

**Two clues suggest the dates are mostly *due/scheduled* dates, not completion dates:**

1. `24h prior to leaving` equals `Discharge Date − 1 day` in **five of six** date-valued rows. That
   is a *derived deadline*, not a record of something that happened.
2. Several `Week 3` / `Week 4 CP/121` dates fall **after** 2026-07-21 (the last save date) — they
   cannot be completion dates for work that had not yet occurred.

But this cannot be true of every column, and mixing `TRUE` into the same column means completion is
sometimes recorded there too. **The workbook cannot express "due on the 3rd, done on the 5th" at
all** — one cell, one value. This single limitation is the strongest justification for the product's
separate `due_date` and `completed_at` fields, and it is why questions 5–8 in
[OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) are blocking for import (but not for build).

Column R (`Side Assignment`) is different again: it holds a **topic**, not a status — three rows
carry short free-text themes. So "Side Assignment" needs a value field, not just a completion flag.

---

## 8. Business rules recoverable from the data

### 8.1 Treatment duration and discharge — inclusive of the admission day

Duration is recorded in **days**: `28` for seven clients, `10` for one. Comparing
`admission + duration` against the recorded discharge date:

| Row | Admission | Duration | admission + duration | Recorded discharge | Delta |
|---|---|---|---|---|---|
| 2  | 2026-07-16 | 28 | 2026-08-13 | 2026-08-12 | **−1** |
| 4  | 2026-06-02 | 28 | 2026-06-30 | 2026-07-29 | **+29** |
| 5  | 2026-07-09 | 28 | 2026-08-06 | 2026-08-05 | **−1** |
| 6  | 2026-07-03 | 28 | 2026-07-31 | 2026-07-30 | **−1** |
| 9  | 2026-06-26 | 28 | 2026-07-24 | 2026-07-22 | **−2** |
| 13 | 2026-07-18 | 10 | 2026-07-28 | 2026-07-27 | **−1** |
| 18 | 2026-06-28 | 28 | 2026-07-26 | 2026-07-25 | **−1** |
| 19 | 2026-07-11 | 28 | 2026-08-08 | 2026-08-07 | **−1** |

Six of eight rows show a consistent **−1**, so the working rule is:

```
planned_discharge_date = admission_date + duration_days − 1
```

i.e. **the admission day counts as day 1** and the discharge day is the last day of treatment.
This is inferred, not confirmed — see question 10.

The two exceptions are informative:

- **Row 9 (−2)** — a one-day discrepancy against the rule. Either a keying error, or a deliberate
  adjustment with no field to record it in.
- **Row 4 (+29)** — a client admitted 2026-06-02 with a 28-day duration but a discharge date 57 days
  after admission. This is almost certainly a **treatment extension** where the discharge date was
  edited and the duration field was left behind. The whiteboard has no way to record that an
  extension happened, who authorised it, or what the original plan was.

Row 4 alone justifies the product holding `original_planned_discharge_date`,
`current_planned_discharge_date` and a reason-logged change history as three distinct things.

### 8.2 Pre-discharge family contact

`24h prior to leaving` = `Discharge Date − 1 day` in five of six date-valued rows (row 5 is off by
one further day). Consistent with a `discharge − 24h` deadline rule, computed by hand and therefore
**not recalculated when the discharge date moves**. Row 4's 29-day extension is exactly the case
where a hand-computed deadline goes stale unnoticed.

### 8.3 Seven-day family-meeting rule — not evidenced in the data

`Family Vist` (column V) is `TRUE` for a single client, `FALSE` for fourteen rows (including all ten
vacant rooms), and **blank** for the last three rows. It is a single boolean with no date, so the
workbook records neither when a visit was requested nor when it took place, and there is nothing in
the file that enforces or even evidences the seven-day eligibility rule described in the brief.

For the one `TRUE` row, admission + 7 days had passed by the last save, so the data is at least not
inconsistent with the rule — but with n=1 that is not evidence. **The rule must be treated as a
stated business requirement to be implemented and confirmed, not as something derived from the
workbook.**

### 8.4 Doctor review

Column AG's header hard-codes a weekday — *"List of client to see doctor on Thursday…"* — and the
column is **entirely empty**. The doctor-review list is evidently maintained somewhere else, or
verbally. Confirms the brief's instruction not to hard-code a review weekday: it must be
per-centre configuration.

Column AD (`Doctor`) names 3 distinct doctors across 7 clients; one client has no doctor recorded.

### 8.5 Workload

Column E names **5 distinct focal therapists across 7 assignments** — two therapists carry two
clients each. One client (row 13) has **no focal therapist at all**. Column G names 6 distinct
buddies across 8 clients, one of whom appears 3 times.

---

## 9. Data-quality findings

Ordered by operational severity.

| # | Severity | Finding | Evidence |
|---|---|---|---|
| 1 | **High** | Column C (client name) has **no header** | Row 1 col C = one space |
| 2 | **High** | Same column mixes date / boolean / `X` semantics | 14 columns, §7 |
| 3 | **High** | No separation of *due* vs *completed* | Single value per cell, §7 |
| 4 | **High** | Duration and discharge date contradict each other on row 4 (+29 days) | §8.1 |
| 5 | **High** | Photo↔client link is positional and off-by-one | §5 |
| 6 | Medium | No client reference — name is the only identifier | §6 |
| 7 | Medium | `X` and `x` both used, inconsistently | Cols U, Y, Z, AA, K, P, Q |
| 8 | Medium | Room labels mix number and text types | Col D: 14 numeric, 4 text |
| 9 | Medium | Row 9 discharge date off by one against the −1 rule | §8.1 |
| 10 | Medium | One client has no focal therapist; one has no doctor | Cols E, AD |
| 11 | Medium | `FALSE` written onto vacant rooms, meaning nothing | §3 |
| 12 | Medium | Malformed date `3//8` in `CCP` | Row 5 col S |
| 13 | Medium | `Family Vist` is `FALSE` ×14 / blank ×3 — two ways to say nothing | Col V |
| 14 | Low | **Five different date formats** in active use: `dd/mm`, `d/m`, `d/m/yy`, `dd/mm/yy`, `d/m/yyyy` | styles.xml |
| 15 | Low | ~60 of ~99 date cells use a format with **no year** (`dd/mm` or `d/m`) | styles.xml |
| 16 | Low | Trailing spaces in values: room `9B `, substance `Alcohol ` (×2 vs `Alcohol` ×5) | Cols D, F |
| 17 | Low | Trailing spaces in 20+ headers | Row 1 |
| 18 | Low | Header typos: `staisfaction`, `Assisgnment`, `Vist`, `Concens` | Row 1 |
| 19 | Low | Column AG entirely empty despite being a named requirement | Col AG |
| 20 | Low | Junk cells: 53 spaces in A4, `/` in AH2, 1 char in AF17 (a vacant room) | — |
| 21 | Low | No legend, key or documentation of any convention | whole file |

On **#14/#15**: a year-less date format is a genuine operational hazard, not a cosmetic issue. A cell
displaying `03/08` is unreadable as to year, and in a service where clients return for repeat
episodes, a stored serial can drift a year from what the reader assumes.

No destructive normalisation is proposed. Every original cell value will be preserved verbatim in
`import_source_values` alongside its interpretation — see [IMPORT_MAPPING.md](IMPORT_MAPPING.md).

---

## 10. What the whiteboard structurally cannot do

Beyond individual data-quality defects, the format has hard limits that the product exists to remove:

1. **No history.** One cell holds one value. When a discharge date changes, the previous value is
   gone — no who, no when, no why. Row 4's extension is invisible.
2. **No ownership.** Tasks have no owner. A column tells you *whether* something happened, never
   *who* is responsible for it or who did it.
3. **No due-vs-done.** Structurally impossible in one cell. Lateness cannot be measured, so
   "were required actions completed within expected timescales?" is unanswerable from this file.
4. **No discharged clients.** A row is a *bed*, so a client vanishes on discharge. There is no
   admission history and no way to see a returning client's previous episode.
5. **No access control.** Safeguarding narratives (column AF), substances and photographs sit in the
   same file as the room list. Anyone who can see occupancy can see everything.
6. **Single centre, fixed shape.** 18 hard-coded rows. A second centre means a second file with a
   different shape, and no combined view.
7. **Stale by construction.** This file was last saved 2026-07-21; read on 2026-07-31 it shows five
   clients whose planned discharge has passed. Nothing is wrong with the data — it is simply ten days
   old, with no way to tell that from the file itself.
8. **No evidence trail.** For governance purposes the file can show a date was typed. It cannot show
   who typed it, when, or what it replaced.

Points 1, 3 and 8 together are why an append-only `audit_events` table and a
`due_date`/`completed_at` split are treated as v1 requirements rather than later additions.

---

## 11. Mapping to product entities

| Workbook column(s) | Target entity | Notes |
|---|---|---|
| D | `rooms` + `beds` | Bed is the allocatable unit; label stored as text |
| C | `clients` | Plus a generated `reference`; name is not an identifier |
| *(images)* | `client_photos` | Manual upload in v1, not auto-imported (§5) |
| B, AB, AC | `admissions` | `admitted_at`, `planned_duration_days`, `original_` + `current_planned_discharge_date` |
| D + B | `room_allocations` | Open allocation from admission date |
| E, G, AD | `staff_assignments` | roles: focal_therapist, buddy, doctor |
| F | `substances` | Trim whitespace; `Alcohol`/`Alcohol ` are one value |
| H | `peep_records` | Boolean today; needs a real record — term unconfirmed |
| I, J, K, L | `family_contacts` (4 templates) | Kept as four distinct templates, never merged |
| V | `family_meetings` | Needs scheduled + actual dates, not a boolean |
| M | `client_tasks` (survey) | +7d offset |
| N, O, P, Q, R, S | `treatment_milestones` | R additionally carries a topic value |
| T | `admissions.treatment_group` | Values `A` / `B` |
| U | `detox_records` | |
| W, X, Y, Z, AA | `client_tasks` (weekly session series) | Intro + weeks 1–4 |
| AE | `client_tasks` (GP summary) | |
| AF | `safeguarding_records` / `risk_records` | Sensitivity level 3 — restricted |
| AG | `medical_review_requests` | Empty; weekday must be configuration |
| A, AH | *(discarded)* | Junk; recorded in import log, not imported |

Full field-level mapping in [IMPORT_MAPPING.md](IMPORT_MAPPING.md); entity definitions in
[DATA_MODEL.md](DATA_MODEL.md).

---

## 12. Confirmed vs inferred — summary

**Confirmed (read directly from the file):**
18 bed spaces incl. 6A/6B/9A/9B · 8 occupied / 10 vacant at last save · 8 embedded photographs ·
33 headers, one column unheadered · duration in days (28 / 10) · no formulas, no legend ·
column AG empty · five date formats · the value-kind mix per column · all 21 data-quality findings.

**Inferred (needs confirmation):**
Column C is the client name · dates are mostly due/scheduled rather than completion dates ·
`discharge = admission + duration − 1` · `24h prior to leaving = discharge − 1 day` ·
`FALSE` means "nothing recorded" · row 4 is an extension rather than an error ·
`X` means done · each column's mapping to a product concept.

**Not evidenced in the workbook at all:**
The seven-day family-meeting eligibility rule · task ownership · any approval or escalation
behaviour · the doctor-review weekday · anything about a second centre.

See [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) for the confirmation round.
