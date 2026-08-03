# Treatment Operations Platform

Multi-centre treatment operations and client-journey platform. First centre: **Primrose Lodge**
(16 rooms / 18 bed spaces).

**Database:** `treatment-ops-dev` on Supabase — London (`eu-west-2`), ref `ygustqrxjaqfbdjftcmq`.
This is a **development** project holding fictional data only. The production project will be
created fresh when the time comes; real client data never touches this one.

Hosting and the GitHub repository are still undecided, and nothing here assumes either.

Design documentation lives one level up in [`../docs/`](../docs/) — start with
[`PRODUCT_OVERVIEW.md`](../docs/PRODUCT_OVERVIEW.md).

---

## Why this is a separate directory

The parent folder is a different product (a public pricing directory) with its own git history and
an **already-linked cloud Supabase project**. This directory is self-contained — its own
`package.json`, its own `supabase/`, its own test config — so it can be lifted into its own
repository the moment that is decided. The parent's `.gitignore` excludes it, so it cannot be
accidentally committed into the wrong repo.

---

## Status

| Part | State |
|---|---|
| Domain logic (`src/domain`) | ✅ **built and tested** — 100 tests passing |
| SQL migrations 0001–0003 | ✅ **applied and verified** on `treatment-ops-dev` |
| Seed data (Primrose Lodge) | ✅ applied — 16 rooms / 18 beds confirmed |
| RLS policies | ⬜ not written — tables are deny-all until they are |
| Remaining schema (clients, admissions, tasks…) | ⬜ not started |
| Application UI | ⬜ not started |

## What runs today

```bash
npm install
```

```bash
npm test
```

```bash
npm run typecheck
```

100 tests, TypeScript `strict` plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
No database required — the business rules are pure functions.

## The database

Migrations 0001–0003 and the seed are **applied and verified** against `treatment-ops-dev`. There is
no local Postgres on this machine and none is required — the cloud dev project is the rehearsal
environment.

Supabase's security linter is clean of warnings. The five remaining `rls_enabled_no_policy` notices
are **expected and correct**: RLS is enabled and forced on every table with no policies yet, so the
tables currently deny everything. They stay that way until the access model lands.

If you later want a local stack as well, install [Docker Desktop](https://www.docker.com/products/docker-desktop/)
plus the Supabase CLI and run `npx supabase db reset` — `seed.sql` asserts 16 rooms / 18 beds and
fails loudly otherwise.

---

## Layout

```
src/domain/          Pure business rules — no framework, no database, no I/O
  zoned-time.ts      Timezone-safe instant arithmetic (BST/GMT correctness)
  centre-settings.ts Per-centre configuration; nothing hard-coded
  discharge.ts       BR-7/8/9/10 — discharge calculation and change handling
  tasks.ts           BR-10/11/12/13 — due dates, overdue derivation, recalculation
  eligibility.ts     BR-19/20/21 — family meeting eligibility
supabase/
  migrations/        Schema, in order
  seed.sql           Fictional seed data + Primrose Lodge rooms and beds
```

The domain layer is deliberately framework-free. It has no dependency on Supabase, React or any
host, so it survives every decision that is still open.

## Two rules that shape the code

**Due is not done.** `dueAt` and `completedAt` are always separate, and `overdue` is derived on read
rather than stored. The source spreadsheet holds one value per action, so it cannot record "due
Monday, done Wednesday" — which is why lateness is unmeasurable in it today.

**Calendar time is not elapsed time.** `addCalendar` preserves the wall clock in the centre's zone;
`addHours` adds elapsed hours. A 28-day admission crosses a BST/GMT boundary roughly one stay in
six, and getting this wrong moves deadlines across midnight. Both behaviours are pinned by tests.

## Never commit

Real client data of any kind: the source workbook, extracted spreadsheet media, client photographs,
real names, safeguarding or medical text. Fictional data only, everywhere — including tests,
fixtures, screenshots and commit messages. See [`../docs/SECURITY_MODEL.md`](../docs/SECURITY_MODEL.md).
