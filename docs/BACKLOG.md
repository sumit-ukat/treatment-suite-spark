# Backlog

Ordered by phase. `[B]` = blocked, with the blocker named.
Acceptance criteria for the first usable version are in [TEST_PLAN.md](TEST_PLAN.md) §1.

---

## Phase 0 — Discovery ✅ complete

- [x] Inspect the workbook in full (structure, styles, drawings, shared strings)
- [x] Produce a sanitised structural summary
- [x] Identify room configuration and occupancy
- [x] Identify embedded photographs and their anchoring
- [x] Catalogue ambiguous status values
- [x] Data-quality review (21 findings)
- [x] Document terminology and unknown terms
- [x] Propose data model, permissions matrix, business rules, workflows
- [x] Create the documentation set
- [x] Ask Round 1 questions

## Phase 1 — Foundation `[B: Q1 repository]`

- [ ] Decide repository and Supabase project *(Q1)*
- [ ] Scaffold TypeScript project, strict mode, ESLint + Prettier
- [ ] Local Supabase stack; `supabase init` / `start` / `db reset` loop
- [ ] Migrations 0001–0004: extensions, org hierarchy, identity/access, access helpers
- [ ] Supabase Auth wiring; server-side session handling
- [ ] App shell: layout, navigation, centre selector, auth guard
- [ ] `accessible_centre_ids()` + permission helpers, with tests
- [ ] Fictional seed data: one org, one zone, Primrose Lodge, one user per role
- [ ] Vitest set up; first RLS integration test executing as a role JWT
- [ ] CI: lint, typecheck, test, and a check that `service_role` is absent from client bundles

## Phase 2 — Organisation, centres, rooms

- [ ] Admin CRUD: organisations, zones, centres
- [ ] Centre settings editor (`settings` jsonb: review weekday, eligibility hours, default duration)
- [ ] Rooms and beds CRUD; shared-room bed creation
- [ ] Seed Primrose Lodge: 16 rooms / 18 beds incl. 6A/6B, 9A/9B
- [ ] Bed availability query and status handling (available / maintenance / closed)
- [ ] Centre selector reflecting the user's real scope

## Phase 3 — Clients and admissions

- [ ] `clients`, `client_photos`, `admissions`, `substances`, `staff_assignments`, `peep_records`
- [ ] `room_allocations` + exclusion constraint + cross-centre FK
- [ ] Client search (prevents duplicate creation of returning clients)
- [ ] Admission wizard (W1) with review screen
- [ ] Discharge-date calculation *(D-015, pending Q3)*
- [ ] Photograph upload → private bucket, MIME + magic-byte + size validation, EXIF strip
- [ ] Photograph verification (W8), replacement history
- [ ] Signed-URL server route with permission check
- [ ] Room board with occupied/available cards
- [ ] Room transfer (W2)

## Phase 4 — Tasks

- [ ] `task_templates`, `client_tasks`, `task_assignments`
- [ ] Seed templates from the workbook columns *(offsets provisional — Round 2)*
- [ ] Task generation at admission (BR-13)
- [ ] Due-date calculation for all bases; overdue view
- [ ] My Work / Team / Centre / Zone / Unassigned / Overdue / Escalated / Recently completed
- [ ] Completion with note and evidence; cancel / not-applicable with mandatory reason
- [ ] Reassignment with history
- [ ] Escalation workflow (W10)

## Phase 5 — Family and treatment workflows

- [ ] `family_contacts` with four distinct types; attempted-but-not-connected outcome
- [ ] `family_meetings` with stored `eligible_from`, check constraint, disabled picker `[B: Q13]`
- [ ] `treatment_milestones` incl. Side Assignment `subject`
- [ ] `detox_records`
- [ ] Weekly session series (Intro + weeks 1–4)
- [ ] GP summary task `[B: Q9]`
- [ ] `medical_review_requests` + doctor queue + per-centre review weekday

## Phase 6 — Discharge

- [ ] Planned-discharge change with reason + task recalculation (W6)
- [ ] Treatment extension as a first-class case
- [ ] `discharge_records`; early-discharge initiate / approve / finalise `[B: Q7]`
- [ ] Retrospective handling of departures without notice
- [ ] Task reconciliation without deletion; outstanding-work snapshot
- [ ] Automatic bed release
- [ ] Discharge checklist

## Phase 7 — Oversight

- [ ] Centre-manager dashboard
- [ ] Supervisor multi-centre dashboard
- [ ] Regional dashboard with centre comparison
- [ ] Therapist workload view *(one workbook client currently has no therapist — this must surface)*
- [ ] Completion-rate and timeliness reporting
- [ ] Audit browser, scope-filtered
- [ ] Export with permission checks and audit `[B: Q28]`

## Phase 8 — Import `[B: Q2]`

- [ ] Upload + workbook validation
- [ ] Worksheet selection, header detection **including unheadered columns**
- [ ] Per-column ambiguity mapping UI
- [ ] Row classification (client vs vacant room)
- [ ] Duplicate and returning-client detection
- [ ] Duration/discharge reconciliation with extension inference
- [ ] Sanitised preview (level-3 content hidden, nothing logged)
- [ ] Validation report and confirmation
- [ ] Commit with `import_source_values` provenance
- [ ] Import summary, error report, reversibility by admission

## Phase 9 — Security and production readiness

- [ ] Full RLS review by a second pair of eyes
- [ ] Storage policy review
- [ ] Audit trigger coverage test (every sensitive table)
- [ ] Log-scrubbing verification (no level-3 content anywhere)
- [ ] MFA and session-timeout policy `[B: Q30]`
- [ ] Backup and **tested restore drill**
- [ ] Retention implementation `[B: Q29]`
- [ ] Deployment documentation `[B: Q31]`
- [ ] Penetration test; DPIA; information-governance sign-off

---

## Cross-cutting

- [ ] Accessibility pass (WCAG 2.1 AA; status by label + icon, never colour alone)
- [ ] Tablet layout verification at 768 px
- [ ] Loading / empty / error states throughout
- [ ] Timezone correctness across a BST↔GMT boundary *(a 28-day admission routinely spans one)*
- [ ] Review any Lovable-generated code for permissions, accessibility and security before it lands

## Deferred / not scheduled

Printable daily handover sheet (Q39) · bed void/cleaning periods (Q36) · realtime dashboard updates ·
notifications and reminders · multi-organisation tenancy (Q32) · integration with an existing
clinical system (Q35) · bulk photograph import (D-006).
