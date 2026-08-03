# Changelog

Dated entry for every material change. Newest first.

---

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
