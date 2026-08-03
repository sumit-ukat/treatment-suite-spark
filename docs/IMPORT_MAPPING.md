# Import Mapping — `Whiteboard .xlsx` → product entities

**Status:** specification for Phase 8. Not implemented.
**Blocked on:** Q2 (status-value semantics), Q3 (discharge rule).

Principles: **never guess silently**, **never normalise destructively**, **preserve every original
value**. Where a value is ambiguous the import stops and asks, rather than picking a plausible reading
and burying it.

---

## Row classification

```
row is a CLIENT row   ⟺  the name column (C) is populated
row is a VACANT ROOM  ⟺  the room column (D) is populated and the name column is not
row is IGNORED        ⟺  neither
```

**Do not** use "row has any data" — the ten vacant rows each carry four values (`Room No.`, `Peeps`,
`Family Vist`, `GP Summary`) and would import as ten phantom clients with everything set `FALSE`.

Vacant rows still matter: they are the authoritative list of beds. They create `rooms`/`beds`, and
their `FALSE` values are discarded (a flag on an empty room describes nobody).

---

## Header mapping

Headers must be matched **case-insensitively with whitespace trimmed** — over 20 carry trailing
spaces and four contain typos (`staisfaction`, `Assisgnment`, `Vist`, `Concens`). Typos are matched
as written; they are not corrected in the source.

**Column C has no header.** Header-driven mapping will drop the single most important column unless
the mapper explicitly supports mapping an unheadered column by position. This is a required feature,
not an edge case.

| Col | Header | Target | Transform |
|---|---|---|---|
| A | `Photo` | *(discard)* | Whitespace junk; photos are drawings — see below |
| B | `Admission Date` | `admissions.admitted_at` | Serial → date. **Time unknown** → prompt for a default (see below) |
| C | *(unheadered)* | `clients.first_name` / `last_name` | Split on last space; **always confirmed by a human**; generate `reference` |
| D | `Room No.` | `rooms.label` + `beds.label` | **Cast to text.** Trim (`9B ` → `9B`). `6A`/`6B` ⇒ room `6`, two beds |
| E | `Focal Therapist` | `staff_assignments` role=`focal_therapist` | Match to a user; unmatched → prompt |
| F | `Substance` | `substances` | Trim; `Alcohol ` ≡ `Alcohol` (case- and space-insensitive dedupe) |
| G | `Buddy` | `staff_assignments` role=`buddy` | **Blocked on Q4** — staff or peer client |
| H | `Peeps` | `admissions.has_peep` + `peep_records` | `TRUE` only; `FALSE` on a vacant row is discarded |
| I | `24hr Family Contact` | `family_contacts` type=`initial_24h` | Status mapping below |
| J | `1st week Contact` | `family_contacts` type=`week_1` | ” |
| K | `2nd week Contact` | `family_contacts` type=`week_2` | ” |
| L | `24h prior to leaving` | `family_contacts` type=`pre_discharge` | ” |
| M | `7 day staisfaction Survey` | `client_tasks` `satisfaction_survey_7day` | ” |
| N | `Life Story /Surrender` | `treatment_milestones` | ” (one or two milestones — Q15) |
| O–Q | `Step 1/2/3` | `treatment_milestones` | ” |
| R | `Side Assisgnment` | `treatment_milestones` + **`subject`** | Text → `subject`; status = present ⇒ assigned |
| S | `CCP` | `treatment_milestones` | ” ; `3//8` → flag `malformed_date` |
| T | `Group` | `admissions.treatment_group` | Trim, uppercase |
| U | `Detox ends` | `detox_records.expected_end_date` | ” |
| V | `Family Vist` | `family_meetings` | `TRUE` ⇒ a meeting record with **no date** (flag `date_unknown`) |
| W–AA | `Intro`/`Week 1–4 CP/121` | `client_tasks` session series | ” |
| AB | `Treatment duration` | `admissions.planned_duration` (unit `days`) | Integer |
| AC | `Discharge Date` | `admissions.current_planned_discharge_date` **and** `original_…` | Serial → date. Reconciliation below |
| AD | `Doctor` | `staff_assignments` role=`doctor` | Match to a user |
| AE | `GP Summary` | `client_tasks` `gp_summary` | `TRUE` ⇒ complete-without-date (Q9) |
| AF | `Safeguarding /Risks/ Concens` | `safeguarding_records.summary` | **Level 3.** Never previewed in console/logs; severity prompted per record |
| AG | *(doctor Thursday list)* | — | Empty; nothing to import |
| AH | *(unheadered)* | *(discard)* | `/` junk |

---

## Status-value mapping — the core of the import

Fourteen columns mix kinds. The importer presents a **per-column mapping table** with these choices,
defaulted to the safest reading and requiring explicit confirmation:

| Source value | Options offered | Default (safest) |
|---|---|---|
| a **date** | due date · scheduled date · completion date | **prompt — no default** |
| `TRUE` | completed (date unknown) · required · in progress | completed, `completed_at = null`, flag `completion_date_unknown` |
| `FALSE` | nothing recorded · not applicable · not done | **nothing recorded** → `not_started` |
| `X` / `x` | completed · not applicable · other | **prompt — no default** (these are opposites) |
| *blank* | not yet due · not applicable · not recorded | **not recorded** → `not_started` |
| malformed (`3//8`) | correct manually · import as unparsed | flag `malformed_date`, do not import a date |

`X` and `x` are treated as the **same** token but the mapping is confirmed once and applied to both
(the workbook uses each inconsistently in the same column).

A `TRUE` that maps to "completed" produces `status = 'completed'` with `completed_at = null` and a
flag. This is deliberately visible: it records honestly that the whiteboard knew *that* it was done
but not *when*. Inventing a completion timestamp would manufacture evidence.

---

## Reconciling duration against discharge date

For each client row, compute `admitted + duration − 1` (BR-7) and compare to column AC:

| Delta | Handling |
|---|---|
| 0 (they agree) | Import both as-is |
| ± 1–2 days | Warn `duration_discharge_minor_mismatch`; import the **recorded** discharge date; derive duration from the recorded dates |
| large (the +29 case) | Warn `probable_extension`; import the recorded date as `current_planned_discharge_date`; set `original_planned_discharge_date` from the **calculation**; write an audit event with reason `imported: extension inferred from source workbook` |

The last row is the interesting one: the import reconstructs a plausible original plan so the
extension becomes visible, and labels it as inferred rather than observed.

---

## Photographs — not imported in v1

The eight PNGs are floating `oneCellAnchor` drawings whose anchor rows are **off by one** against the
client rows (WORKBOOK_REVIEW §5). Position is the only available link, and attaching the wrong
photograph to the wrong client is a misidentification risk in a service where photographs exist
precisely to confirm identity.

**Decision (D-006):** import client rows only; photographs are uploaded and verified through the
normal workflow (W8). Imported clients therefore show "missing photograph" on the dashboard, which is
accurate and actionable.

If auto-import is later required, it must compute each image's vertical span from `rowOff` plus
height against cumulative row heights, match by image centre, and present every pairing for human
confirmation before commit.

---

## Duplicate detection

- Same normalised name **and** overlapping admission dates → probable duplicate; prompt.
- Same normalised name, non-overlapping dates → probable **returning client**; offer to link to the
  existing `clients` row as a second admission. This is the case the workbook cannot represent at all.
- Two client rows on one bed with overlapping periods → hard error; the exclusion constraint would
  reject it anyway.

---

## Preview and reporting

The **sanitised preview** shows row number, room, mapped fields and warning flags. Names are shown
(the operator must verify them) but **no safeguarding narrative, no medical text, and nothing written
to console or server logs**. Level-3 fields display as *"1 record — content hidden"*.

**Validation report** before commit: rows classified · fields mapped · unmapped columns · ambiguous
values by type · unmatched staff names · duplicates · date-format anomalies (five formats in use;
~60% of date cells carry no year) · duration/discharge mismatches.

**Import summary** after commit: created/skipped/failed counts, per-row errors, and an
`import_jobs` row linking to every `import_source_values` record. The whole job is reversible by
admission, since every created record carries its `import_job_id`.

---

## Provenance

Every source cell is written to `import_source_values`:

```jsonc
{
  "row_number": 5, "column_letter": "K", "column_header": "2nd week Contact ",
  "raw_value": "46231", "raw_type": "n", "number_format": "d/m/yy",
  "interpreted_as": { "as": "due_date", "value": "2026-07-23", "confidence": "mapped" },
  "target_record_type": "family_contacts", "target_record_id": "…",
  "ambiguity_flag": null
}
```

So "why does this task say not applicable?" is always answerable from the original cell, its format
and the mapping choice that was made — indefinitely.
