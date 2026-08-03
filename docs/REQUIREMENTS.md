# Requirements

Requirements are separated by **origin**, as instructed. Confirmed = stated in the brief or read
directly from the workbook. Inferred = our reading, needing confirmation. Each carries an ID for
traceability into the backlog and test plan.

---

## A · Confirmed — from the brief

### Structure
| ID | Requirement |
|---|---|
| C-01 | Hierarchy: organisation → zone/region → centre → room → bed → client → admission → records |
| C-02 | Primrose Lodge is the first centre; ~18 rooms/bed spaces including shared 6A/6B, 9A/9B |
| C-03 | Additional centres, zones and regions are added by configuration, not code changes |
| C-04 | No centre name, room label or person's name in business logic |
| C-05 | Two connected layers: live dashboard + per-client electronic file |
| C-06 | The client file is the source of truth; dashboards are projections |
| C-07 | Client record is separate from admission episode; a client may return |
| C-08 | Tasks, allocations, milestones and discharge records belong to the admission |

### Access
| ID | Requirement |
|---|---|
| C-10 | Role-based **and** location/scope-based access, deny by default |
| C-11 | Enforced in frontend, services, server routes, RLS, file access and exports |
| C-12 | A user may hold different roles at different centres |
| C-13 | Temporary cross-centre cover has reason, start, end, approver, audit and automatic expiry |
| C-14 | Four sensitivity levels; access depends on role, scope, assignment and level |
| C-15 | Helpdesk sees restricted placeholders, never sensitive content |
| C-16 | Technical administration does not imply clinical access |
| C-17 | Hiding a UI control is not sufficient security |

### Operations
| ID | Requirement |
|---|---|
| C-20 | Bed-level allocation supporting single and shared rooms |
| C-21 | Prevent double-booking, cross-centre allocation and allocation of closed beds |
| C-22 | Room transfer preserves full allocation history |
| C-23 | Bed released automatically at actual discharge |
| C-24 | Photographs: upload, verify, replace-with-history, private storage, signed URLs |
| C-25 | Configurable task templates — not a fixed column per action |
| C-26 | `due_date` and `completed_at` are separate fields |
| C-27 | Statuses include not started, scheduled, in progress, completed, blocked, cancelled, not applicable, awaiting review |
| C-28 | Tasks carry a responsible role/team **and** an optional named owner |
| C-29 | Work queues: My / Team / Centre / Zone / Unassigned / Overdue / Escalated / Recently completed |
| C-30 | Four distinct family-contact obligations, never merged |
| C-31 | Pre-discharge contact = planned discharge − 24 h, recalculated on change |
| C-32 | Family meeting requires one week in treatment; configurable; no v1 override |
| C-33 | The seven-day rule must not block the 24-hour contact |
| C-34 | Store original, current and actual discharge dates separately |
| C-35 | Discharge-date change requires a reason and is audited |
| C-36 | Early discharge is a dedicated workflow with initiate/approve/finalise |
| C-37 | Early discharge never fabricates completion of impossible actions |
| C-38 | Structured records for detox, medical review, risk, safeguarding, PEEPs |
| C-39 | Doctor-review schedule is per-centre configuration |
| C-40 | Structured escalation workflow with routes and resolution |
| C-41 | Append-only audit of all significant actions, including denied access |
| C-42 | Controlled workbook import with mapping, preview, ambiguity handling and audit |
| C-43 | Import preserves original source values |

### Platform
| ID | Requirement |
|---|---|
| C-50 | Supabase backend: Postgres, Auth, Storage, RLS, migrations, functions |
| C-51 | Private storage buckets; no public photograph access |
| C-52 | `service_role` never exposed to the browser |
| C-53 | Business rules in a trusted layer, never only client-side |
| C-54 | TypeScript strict mode; accessible, responsive desktop + tablet UI |
| C-55 | Status conveyed by label and icon, **not colour alone** |
| C-56 | **No Vercel**, and no Vercel-specific dependencies |
| C-57 | Lovable output is reviewed, never an unreviewed source of truth |
| C-58 | Fictional test data only; no real workbook, photos or names in source control |
| C-59 | No claim of automatic CQC compliance |
| C-60 | No automated clinical decision-making |
| C-61 | **Everything runs locally for now**; hosting decided later *(user instruction, 2026-07-31)* |

---

## B · Confirmed — from the workbook

| ID | Requirement | Evidence |
|---|---|---|
| W-01 | 18 bed spaces: 14 single + 6A/6B + 9A/9B | Column D, 18 rows |
| W-02 | Room labels are text, not numbers (mixed types in source) | 14 numeric, 4 text |
| W-03 | Treatment duration is recorded in **days** | 28 ×7, 10 ×1 |
| W-04 | Tracked roles: focal therapist, buddy, doctor | Columns E, G, AD |
| W-05 | Substance is a small controlled list | Column F, 2 real values |
| W-06 | Treatment group A/B exists | Column T |
| W-07 | Four family-contact points already tracked separately | Columns I, J, K, L |
| W-08 | Weekly one-to-one series: intro + weeks 1–4 | Columns W–AA |
| W-09 | Step-work milestones: Steps 1–3, Life Story/Surrender, Side Assignment, CCP | Columns N–S |
| W-10 | Side Assignment needs a **topic value**, not just a status | Column R holds text themes |
| W-11 | Detox end date is tracked | Column U |
| W-12 | GP summary is tracked | Column AE |
| W-13 | Safeguarding/risk is free-text today | Column AF |
| W-14 | A doctor-review list is a stated need but is not being maintained | Column AG empty |
| W-15 | A client identifier must be introduced — none exists | No reference column |
| W-16 | Staff workload is uneven and must be visible | 5 therapists / 7 clients; 1 client unassigned |

---

## C · Inferred — requires confirmation

| ID | Inference | Question |
|---|---|---|
| I-01 | Discharge = admission + duration − 1 (admission day counts as day 1) | Q3 |
| I-02 | One client's +29-day discrepancy is an unrecorded extension | Q3 |
| I-03 | Dates in status columns are mostly due/scheduled, not completion | Q2 |
| I-04 | `X` means done; `FALSE`/blank mean nothing recorded | Q2 |
| I-05 | Column C is the client name | Q2 (implicit) |
| I-06 | `CP/121` is a weekly one-to-one review | Q8 |
| I-07 | PEEPs = Personal Emergency Evacuation Plan | Q8 |
| I-08 | Buddy is a staff member (may be a peer client) | Q4 |
| I-09 | Steps 1–3 are sequential twelve-step work | Q8 |
| I-10 | `Life Story / Surrender` may be two deliverables | Q15 |
| I-11 | First/second-week contacts are +7 d / +14 d | Q10, Q11 |
| I-12 | UK/EU data residency is required | Q31 |
| I-13 | Admission **time** must be captured (the workbook has date only) | Q12 |

---

## D · Non-functional

| ID | Requirement |
|---|---|
| N-01 | Dashboard loads in < 2 s for a centre of ~20 beds |
| N-02 | Task queues remain responsive at ~10,000 tasks per centre per year |
| N-03 | WCAG 2.1 AA: keyboard navigable, screen-reader labelled, no colour-only status |
| N-04 | Usable on tablet (768 px+) — the likely device on a ward round |
| N-05 | Clear loading, empty and error states everywhere |
| N-06 | Errors never leak sensitive content into messages or logs |
| N-07 | All timestamps `timestamptz`; displayed in centre timezone; BST/GMT-safe arithmetic |
| N-08 | Portable build (Nitro → any Node host); no host-specific APIs |
| N-09 | Migrations are versioned, reviewed and reversible where practical |
| N-10 | Seed data is fictional and reproducible |

---

## E · Explicitly out of scope

Automated clinical decision-making or risk scoring · prescribing or medication administration ·
client-facing portal · billing or invoicing · rostering · CQC submission ·
integration with external clinical systems (Q35) · native mobile apps · offline mode.
