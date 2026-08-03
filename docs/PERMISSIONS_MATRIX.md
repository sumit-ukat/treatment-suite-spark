# Permissions Matrix

**Status:** draft for confirmation. Cells marked **?** are genuinely undecided and appear as
questions in [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) — they are **denied** until answered.

Legend
`✔` allowed · `✖` denied · `◐` limited (restricted indicator / metadata only, no narrative) ·
`○` own or assigned records only · `?` awaiting confirmation → currently denied

---

## Two independent dimensions

Access = **role** (what verbs) **×** **scope** (which centres). Both must pass. A centre manager at
Primrose Lodge has manager verbs *only at Primrose Lodge* — elsewhere they have nothing at all.

Scope comes from `user_access_assignments` rows (`organisation` | `zone` | `centre`), each optionally
`is_read_only` and optionally time-bounded. A user may hold several. **Absence of an assignment is
denial**, and there is no implicit inheritance downward from seniority: a regional manager sees the
centres in their assigned zone, not "all centres", and being an administrator grants no clinical read.

---

## Roles × capability

| Capability | Platform admin | Regional ops | Supervisor | Centre manager | Therapist | Support staff | Helpdesk | Doctor |
|---|---|---|---|---|---|---|---|---|
| **Visibility** |
| View own scope dashboard | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Switch between centres in scope | ✔ | ✔ | ✔ | ✔ | ✖ | ✖ | ✔ | ✔ |
| Combined zone / multi-centre view | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ | ? | ✖ |
| Cross-centre comparison reports | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ |
| **Clients** |
| View client list (name, room, status) | ◐ | ✔ | ✔ | ✔ | ○ **Q6** | ✔ | ? **Q20** | ○ |
| View full client file | ✖ | ? **Q24** | ✔ | ✔ | ○ | ◐ | ✖ | ○ |
| Create client | ✖ | ✖ | ✔ | ✔ | ✖ | ✔ | ✖ | ✖ |
| Edit client identity | ✖ | ✖ | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ |
| Archive client | ✖ | ✖ | ✖ | ✔ | ✖ | ✖ | ✖ | ✖ |
| **Photographs** |
| View photograph | ✖ | ✔ | ✔ | ✔ | ○ | ✔ | ? **Q21** | ○ |
| Upload / replace | ✖ | ✖ | ✔ | ✔ | ✖ | ✔ **Q19** | ✖ | ✖ |
| **Verify** | ✖ | ✖ | ✔ | ✔ | ✖ | ✖ **Q19** | ✖ | ✖ |
| Export photograph | ✖ | ✖ | ✖ | ✔ | ✖ | ✖ | ✖ | ✖ |
| **Admissions & beds** |
| Create / edit admission | ✖ | ✖ | ✔ | ✔ | ✖ | ✔ | ✖ | ✖ |
| Allocate bed | ✖ | ✖ | ✔ | ✔ | ✖ | ✔ | ✖ | ✖ |
| Transfer room | ✖ | ✖ | ✔ | ✔ | ✖ | ✔ | ✖ | ✖ |
| Close room / set maintenance | ✔ | ✖ | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ |
| Assign focal therapist / buddy | ✖ | ? | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ |
| **Tasks** |
| View task queues in scope | ◐ | ✔ | ✔ | ✔ | ○ | ✔ | ◐ | ○ |
| Complete **operational** task | ✖ | ✖ | ✔ | ✔ | ✔ | ✔ | ✔ **Q22** | ✖ |
| Complete **clinical / milestone** task | ✖ | ✖ | ✖ | ✖ | ✔ | ✖ | ✖ | ✔ |
| Create ad-hoc task | ✖ | ? | ✔ | ✔ | ✔ | ✔ | ◐ | ✔ |
| Assign / reassign task | ✖ | ? **Q24** | ✔ **Q23** | ✔ | ✖ | ✖ | ◐ **Q22** | ✖ |
| Reopen completed task | ✖ | ✖ | ✔ | ✔ | ○ | ✖ | ✖ | ✖ |
| Cancel / mark not-applicable (reason required) | ✖ | ✖ | ✔ | ✔ | ○ | ✖ | ✖ | ✖ |
| Escalate | ✖ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| **Family** |
| View family-contact status | ✖ | ✔ | ✔ | ✔ | ○ | ✔ | ◐ | ○ |
| Record family contact | ✖ | ✖ | ✔ | ✔ | ✔ | ✔ | ✖ | ✖ |
| Schedule family meeting *(eligibility enforced)* | ✖ | ✖ | ✔ | ✔ | ✔ | ✔ | ✖ | ✖ |
| Override eligibility | **✖ — nobody in v1** | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ |
| **Sensitive (level 3)** |
| See a restricted-alert **indicator** | ◐ | ✔ | ✔ | ✔ | ✔ | ◐ | ◐ | ✔ |
| Read safeguarding / risk **narrative** | ✖ | ? **Q5** | ? **Q5** | ✔ **Q5** | ○ **Q5** | ✖ | ✖ | ✔ |
| Create safeguarding / risk record | ✖ | ✖ | ✔ | ✔ | ✔ | ◐ | ✖ | ✔ |
| Read detox / medical detail | ✖ | ? **Q5** | ? | ✔ **Q5** | ○ | ✖ | ✖ | ✔ |
| Read therapy notes | ✖ | ✖ | ? | ? | ○ | ✖ | ✖ | ? |
| Request medical review | ✖ | ✖ | ✔ | ✔ | ✔ | ✔ | ✖ | ✔ |
| Record review outcome | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✔ |
| **Discharge** |
| Change planned discharge date (reason required) | ✖ | ✖ | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ |
| Initiate early discharge | ✖ | ? **Q7** | ✔ **Q7** | ✔ **Q7** | ✖ | ✖ | ✖ | ✖ |
| **Approve** early discharge | ✖ | ? **Q7** | ✔ **Q7** | ✖ **Q7** | ✖ | ✖ | ✖ | ✖ |
| Finalise discharge | ✖ | ✖ | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ |
| **Administration** |
| Manage centres / rooms / beds | ✔ | ✖ | ✖ | ◐ own centre | ✖ | ✖ | ✖ | ✖ |
| Manage users & access assignments | ✔ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ |
| Grant temporary cross-centre cover | ✔ | ✔ | ✔ **Q26** | ✖ | ✖ | ✖ | ✖ | ✖ |
| Manage task templates | ✔ | ✖ | ✖ | ◐ own centre | ✖ | ✖ | ✖ | ✖ |
| Run workbook import | ✔ | ✖ | ✖ | ✔ | ✖ | ✖ | ✖ | ✖ |
| Read audit log | ✔ | ◐ summary | ✔ scope | ✔ centre | ✖ | ✖ | ✖ | ✖ |
| Export client data | ✖ | ◐ aggregate | ◐ aggregate | ✔ | ✖ | ✖ | ✖ | ✖ |

---

## Two decisions worth flagging

**1. Platform administrator has almost no clinical read.**
The `platform_admin` row is `✖` down most of the client columns. This is deliberate: technical
administration and clinical access are separated, so the person who manages users and infrastructure
does not thereby acquire the ability to read safeguarding narratives. An administrator can grant
themselves a clinical role — but that grant is itself an audited `user_access_assignments` row with a
`granted_by`, which is the point. The alternative (admin sees everything) makes the audit log
meaningless for the highest-privilege account.

Practical consequence: a `service_role` key bypasses RLS entirely. Its use is restricted to
migrations and specific server-side functions, never to a general admin UI. See
[SECURITY_MODEL.md](SECURITY_MODEL.md).

**2. Regional visibility is not clinical access.**
The regional operations row is `✔` for occupancy, counts, completion rates and workload, and `?`/`✖`
for narratives and record editing. Seeing that a centre has three active restricted alerts is an
oversight function; reading the three narratives is a clinical one. The brief warns against
conflating them, and Q5/Q24 settle it.

---

## Helpdesk — the restricted view in practice

Helpdesk is the sharpest test of the model. A helpdesk user assigned to Primrose Lodge sees:

```
Task #4127 · Arrange transport            Client ref PL-1042 · Room 12
Owner: unassigned · Due: today 16:00 · Status: overdue
⚠ Restricted alert — contact centre manager
```

They can see the task exists, that it is late, that nobody owns it, and that *something* restricted
applies to this client. They cannot see the substance, the safeguarding text, the therapy notes, the
detox regime, or — pending Q20/Q21 — possibly not the name or photograph either.

The restricted indicator is generated from `safeguarding_records.severity` and `is_active`
(level‑1 metadata) without touching `summary` (level 3). Enforced by RLS returning zero rows for the
narrative, not by a component choosing not to render it.

---

## Enforcement — four layers, not one

Hiding a button is not security. Every rule above is enforced at:

1. **Postgres RLS** — the real boundary. A query from a helpdesk JWT returns *no rows* for
   `safeguarding_records.summary`.
2. **Server functions** — workflow rules (eligibility, approval separation, double-booking) run in
   `SECURITY DEFINER` functions with explicit permission checks.
3. **Route guards** — server-side, before any data is loaded.
4. **UI** — hides what the user cannot use. Convenience only; assumed bypassable.

Tests assert layer 1 directly by executing queries as each role's JWT, so a UI regression cannot
silently open a hole. See [TEST_PLAN.md](TEST_PLAN.md).

---

## Temporary cover

A `user_access_assignments` row with `ends_at` set, plus mandatory `grant_reason` and `granted_by`.
Every policy filters on `now() between starts_at and coalesce(ends_at,'infinity')`, so **expiry needs
no scheduled job** — access simply stops matching. Grant, use and expiry are all audited. Maximum
duration before renewal is Q26.
